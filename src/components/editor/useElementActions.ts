import { useCallback, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  Element,
  Layout,
  LIMITS,
  MarkerKind,
  findIssues,
  newColumn,
  newMarker,
  newTable,
  newZone,
  uid,
} from '@/lib/layout';
import { Key, Lang, STRINGS } from '@/lib/i18n';
import { round2 } from '../NumField';
import { clamp, type Spec } from '../editor-specs';

type Deps = {
  t: (k: Key) => string;
  langRef: MutableRefObject<Lang>;
  layoutRef: MutableRefObject<Layout>;
  selectionRef: MutableRefObject<string[]>;
  lockedRef: MutableRefObject<boolean>;
  lockMsgRef: MutableRefObject<string>;
  commit: (next: Layout, key?: string) => void;
  setSelection: Dispatch<SetStateAction<string[]>>;
  setSelectedId: (id: string | null) => void;
  setToast: (msg: string) => void;
  setPendingDelete: (p: { text: string; run: () => void } | null) => void;
  snapV: (v: number) => number;
  bumpUsage: (shape: 'round' | 'rect', seats: number, by?: number) => void;
  viewCenter: () => { x: number; y: number };
};

/** Adding, copying, pasting, rotating and removing hall elements. */
export function useElementActions(d: Deps) {
  const {
    t,
    langRef,
    layoutRef,
    selectionRef,
    lockedRef,
    lockMsgRef,
    commit,
    setSelection,
    setSelectedId,
    setToast,
    setPendingDelete,
    snapV,
    bumpUsage,
    viewCenter,
  } = d;

  const makeElement = (sp: Spec, x: number, y: number): Element => {
    const l = layoutRef.current;
    if (sp.kind === 'table') {
      const n = l.elements.filter((e) => e.kind === 'table').length + 1;
      return {
        ...newTable(x, y, sp.shape, clamp(Math.round(sp.seats), LIMITS.seatsMin, LIMITS.seatsMax), n),
        label: `${t('table')} ${n}`,
      };
    }
    if (sp.kind === 'column') return { ...newColumn(x, y, sp.shape), label: t('column') };
    if (sp.kind === 'zone') return { ...newZone(x, y), label: t('raisedArea') };
    return { ...newMarker(x, y, sp.marker), label: markerLabel(sp.marker) };
  };

  /** Adds anything from the palette at a world position (drop point, menu point or free spot). */
  const addSpecAt = (sp: Spec, x: number, y: number) => {
    const l = layoutRef.current;
    if (l.elements.length >= LIMITS.maxElements) return;
    const el = makeElement(sp, snapV(x), snapV(y));
    commit({ ...l, elements: [...l.elements, el] });
    if (el.kind === 'table') bumpUsage(el.shape, el.seats);
    setSelectedId(el.id);
  };
  const addTableAt = (shape: 'round' | 'rect', seats: number, x: number, y: number) =>
    addSpecAt({ kind: 'table', shape, seats }, x, y);

  const markerLabel = (k: MarkerKind) => (k === 'walkway' ? t('safeRoute') : k === 'exit' ? t('emergencyExit') : t(k));

  /** Click on a palette item: tables and columns go to the first free spot nearest the view centre. */
  const addPreset = (sp: Spec) => {
    const l = layoutRef.current;
    const c = viewCenter();
    let best = { x: c.x, y: c.y };
    if (sp.kind === 'table' || sp.kind === 'column') {
      const probe = makeElement(sp, 0, 0);
      search: for (let ring = 0; ring <= 8; ring++) {
        for (let i = -ring; i <= ring; i++) {
          for (let j = -ring; j <= ring; j++) {
            if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
            const trial = { ...probe, x: c.x + i * 1.5, y: c.y + j * 1.5 };
            if (!findIssues([...l.elements, trial], l.settings).some((is) => is.a === trial.id || is.b === trial.id)) {
              best = { x: trial.x, y: trial.y };
              break search;
            }
          }
        }
      }
    } else {
      const nudge = (l.elements.length % 5) * 0.5;
      best = { x: c.x + nudge, y: c.y + nudge };
    }
    addSpecAt(sp, best.x, best.y);
  };

  const removeSelected = useCallback(() => {
    if (lockedRef.current) {
      setToast(lockMsgRef.current);
      return;
    }
    const l = layoutRef.current;
    const ids = new Set(selectionRef.current);
    if (ids.size === 0) return;
    const run = () => {
      const cur = layoutRef.current;
      commit({
        ...cur,
        elements: cur.elements.filter((e) => !ids.has(e.id)),
        guests: cur.guests.map((g) => (g.tableId && ids.has(g.tableId) ? { ...g, tableId: null, seat: null } : g)),
      });
      setSelection([]);
    };
    const tableIds = l.elements.filter((e) => e.kind === 'table' && ids.has(e.id)).map((e) => e.id);
    if (tableIds.length === 0) return run(); // plain shapes: Undo is enough
    const seated = l.guests.filter((g) => g.tableId && tableIds.includes(g.tableId)).length;
    setPendingDelete({
      text: STRINGS[langRef.current].confirmRemoveTables
        .replace('{n}', String(tableIds.length))
        .replace('{k}', String(seated)),
      run,
    });
  }, [commit]);

  /** Adds copies of the given elements, shifted; tables get the next table numbers and no guests. */
  const pasteElements = (src: Element[], shift: number) => {
    if (lockedRef.current) {
      setToast(lockMsgRef.current);
      return;
    }
    const l = layoutRef.current;
    let n = l.elements.filter((e) => e.kind === 'table').length;
    const made: Element[] = [];
    for (const e of src) {
      const copy = { ...e, id: uid(), x: round2(e.x + shift), y: round2(e.y + shift) } as Element;
      if (copy.kind === 'table') {
        n += 1;
        copy.label = `${t('table')} ${n}`;
        bumpUsage(copy.shape, copy.seats);
      }
      made.push(copy);
    }
    if (made.length === 0 || l.elements.length + made.length > LIMITS.maxElements) return;
    commit({ ...l, elements: [...l.elements, ...made] });
    setSelection(made.map((e) => e.id));
  };
  const clipboard = useRef<{ els: Element[]; pastes: number }>({ els: [], pastes: 0 });
  const selectedElements = () => {
    const ids = new Set(selectionRef.current);
    return layoutRef.current.elements.filter((e) => ids.has(e.id));
  };
  const copySelected = () => {
    const els = selectedElements();
    if (els.length === 0) return;
    clipboard.current = { els: els.map((e) => ({ ...e })), pastes: 0 };
  };
  const pasteClipboard = () => {
    const c = clipboard.current;
    if (c.els.length === 0) return;
    c.pastes += 1;
    pasteElements(c.els, 0.8 * c.pastes);
  };
  const duplicateSelected = () => pasteElements(selectedElements(), 0.8);

  /** Quarter turn; a group turns around its own centre so the arrangement is kept. */
  const rotateSelected = () => {
    if (lockedRef.current) {
      setToast(lockMsgRef.current);
      return;
    }
    const l = layoutRef.current;
    const ids = new Set(selectionRef.current);
    const picked = l.elements.filter((e) => ids.has(e.id));
    if (picked.length === 0) return;
    const cx = picked.reduce((a, e) => a + e.x, 0) / picked.length;
    const cy = picked.reduce((a, e) => a + e.y, 0) / picked.length;
    const turn = (r: number) => {
      let v = Math.round(r + 90);
      if (v > 180) v -= 360;
      return v;
    };
    commit({
      ...l,
      elements: l.elements.map((e) =>
        !ids.has(e.id)
          ? e
          : ({
              ...e,
              rotation: turn(e.rotation),
              ...(picked.length > 1 ? { x: round2(cx - (e.y - cy)), y: round2(cy + (e.x - cx)) } : {}),
            } as Element),
      ),
    });
  };

  const emptyTable = (tableId: string) => {
    const l = layoutRef.current;
    commit({ ...l, guests: l.guests.map((g) => (g.tableId === tableId ? { ...g, tableId: null, seat: null } : g)) });
  };

  return {
    makeElement,
    markerLabel,
    addSpecAt,
    addTableAt,
    addPreset,
    removeSelected,
    copySelected,
    pasteClipboard,
    duplicateSelected,
    rotateSelected,
    emptyTable,
  };
}
