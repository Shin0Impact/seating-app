'use client';

import type Konva from 'konva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Line, Stage, Transformer } from 'react-konva';
import {
  Element,
  Guest,
  Layout,
  LIMITS,
  MARKER_KINDS,
  MarkerKind,
  Settings,
  TableEl,
  emptyLayout,
  findIssues,
  firstFreeSeat,
  nearestChair,
  newGuest,
  placeNewTables,
  normalizeSeats,
  seatGuest,
  seatMany,
  chairWorld,
  tableAt,
  newColumn,
  newMarker,
  newTable,
  newZone,
  overfullTables,
  parseLayout,
  seatedCounts,
  snap,
  summarize,
  tableDims,
  tableFootprint,
  uid,
  snapToGridEdges,
} from '@/lib/layout';
import { Key, Lang, STRINGS, dirOf } from '@/lib/i18n';
import { ChairPicker } from './ChairPicker';
import { ContextMenu, MenuItem } from './ContextMenu';
import { applyPalette, ChairTip, ElementNode, FONT, IssueState } from './ElementNode';
import { GuestsView } from './GuestsView';
import { NumField, round2 } from './NumField';
import { SeatList } from './SeatList';
import { TablesView } from './TablesView';
import { Icon, IconButton } from './Icon';
import SettingsDialog from './SettingsDialog';
import type { AccountProps } from './SettingsPanel';
import { useLang } from './LangProvider';
import { useTheme } from '@/lib/theme';
import { GuestEditPopup } from './ChairPicker';
import { inviteDrafts } from '@/lib/invites';
import { coarsePointer, readPayload, TouchPayload } from '@/lib/touchdrag';

const STORAGE_KEY = 'seating-layout-v1';
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const ORDER: Record<Element['kind'], number> = { zone: 0, marker: 1, table: 2, column: 3 };

const USAGE_KEY = 'seating-table-usage-v1';
/** Shown when nothing has been used yet; usage then reorders them and brings in new sizes. */
const DEFAULT_PRESETS: { shape: 'round' | 'rect'; seats: number }[] = [
  { shape: 'round', seats: 20 },
  { shape: 'round', seats: 10 },
  { shape: 'round', seats: 8 },
  { shape: 'round', seats: 12 },
  { shape: 'rect', seats: 20 },
  { shape: 'rect', seats: 10 },
  { shape: 'rect', seats: 8 },
];
const PRESET_SLOTS = 7;

type MenuState = { x: number; y: number; wx: number; wy: number; target: { kind: 'blank' } | { kind: 'element'; id: string } | { kind: 'chair'; tableId: string; seat: number } };

type Spec =
  | { kind: 'table'; shape: 'round' | 'rect'; seats: number }
  | { kind: 'column'; shape: 'circle' | 'square' }
  | { kind: 'zone' }
  | { kind: 'marker'; marker: MarkerKind };

const specToString = (sp: Spec) =>
  sp.kind === 'table' ? `table:${sp.shape}:${sp.seats}` : sp.kind === 'column' ? `column:${sp.shape}` : sp.kind === 'marker' ? `marker:${sp.marker}` : 'zone';

function parseSpec(str: string): Spec | null {
  const [kind, a, b] = str.split(':');
  if (kind === 'table' && (a === 'round' || a === 'rect') && Number.isFinite(Number(b))) return { kind, shape: a, seats: clamp(Math.round(Number(b)), LIMITS.seatsMin, LIMITS.seatsMax) };
  if (kind === 'column' && (a === 'circle' || a === 'square')) return { kind, shape: a };
  if (kind === 'zone') return { kind };
  if (kind === 'marker' && (MARKER_KINDS as readonly string[]).includes(a)) return { kind, marker: a as MarkerKind };
  return null;
}

type View = { scale: number; x: number; y: number };

export type EditorProps = {
  /** Server-backed mode: start from this plan and report every change instead of using localStorage. */
  initial?: Layout;
  onChange?: (layout: Layout) => void;
  /** Shown at the start of the top bar (for example a link back to the events list). */
  leading?: React.ReactNode;
  /** Set when the editor runs inside an event: adds the Account section to Settings. */
  account?: AccountProps;
  /** Open zoomed in on this guest's chair (from the guests page pin). */
  focusGuest?: string;
};

export default function Editor({ initial, onChange, leading, account, focusGuest }: EditorProps = {}) {
  const { lang } = useLang();
  const t = useCallback((k: Key) => STRINGS[lang][k], [lang]);
  const langRef = useRef(lang);
  langRef.current = lang;
  const { theme } = useTheme();
  applyPalette(theme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Anything destructive that is not undone by a click asks first; the pending action runs on Delete. */
  const [pendingDelete, setPendingDelete] = useState<{ text: string; run: () => void } | null>(null);

  const [layout, setLayout] = useState<Layout>(emptyLayout);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const past = useRef<Layout[]>([]);
  const future = useRef<Layout[]>([]);
  const lastEdit = useRef<{ key: string; time: number }>({ key: '', time: 0 });
  const [hydrated, setHydrated] = useState(false);

  const [view_, setViewTab] = useState<'hall' | 'guests' | 'tables'>('hall');
  const inHall = view_ === 'hall';
  const [selection, setSelection] = useState<string[]>([]);
  const selectionRef = useRef<string[]>([]);
  selectionRef.current = selection;
  /** The one selected element, for the properties panel; null when none or several. */
  const selectedId = selection.length === 1 ? selection[0] : null;
  const setSelectedId = useCallback((id: string | null) => setSelection(id ? [id] : []), []);
  // phones start with the panel folded so the hall gets the screen (the editor only runs in the browser)
  const [sheetOpen, setSheetOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 760px)').matches);
  const [measured, setMeasured] = useState(false);
  const pinch = useRef<{ dist: number } | null>(null);
  const inHallRef = useRef(true);
  inHallRef.current = inHall;
  const [selectTool, setSelectTool] = useState(false);
  const [peopleTool, setPeopleTool] = useState(false);
  const [peopleSel, setPeopleSel] = useState<string[]>([]);
  const peopleSelRef = useRef<string[]>([]);
  peopleSelRef.current = peopleSel;
  const pickedSet = useMemo(() => new Set(peopleSel), [peopleSel]);
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);
  const togglePerson = (id: string) => setPeopleSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const [snapGrid, setSnapGrid] = useState(() => {
    try { return localStorage.getItem('seating-snap-grid') === '1'; } catch { return false; }
  });
  const [layoutLocked, setLayoutLocked] = useState(() => {
    try { return localStorage.getItem('seating-layout-locked') === '1'; } catch { return false; }
  });
  const lockedRef = useRef(layoutLocked);
  lockedRef.current = layoutLocked;
  const lockMsgRef = useRef('');
  lockMsgRef.current = t('layoutLocked');
  const toggleLock = () => {
    const n = !layoutLocked;
    setLayoutLocked(n);
    try { localStorage.setItem('seating-layout-locked', n ? '1' : '0'); } catch {}
  };
  const [addOpen, setAddOpen] = useState(false);
  const [addPos, setAddPos] = useState<{ x: number; y: number } | null>(null);
  const [dragHide, setDragHide] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const snapStep = snapGrid ? 1 : 0.1;
  /** Snaps the left and bottom of what is actually drawn (the blue box) to the grid. */
  const snapToDrawnEdges = (node: Konva.Node | undefined, x: number, y: number) => {
    const layer = node?.getLayer();
    if (!node || !layer) return null;
    const r = node.getClientRect({ relativeTo: layer });
    const ox = r.x - node.x();
    const oy = r.y + r.height - node.y(); // bottom edge
    const k = (n: number) => Math.round(n * 1000) / 1000;
    return { x: k(snap(x + ox, 1) - ox), y: k(snap(y + oy, 1) - oy) };
  };
  const snapV = (v: number) => snap(v, snapStep);
  const toggleSnap = () => {
    const n = !snapGrid;
    setSnapGrid(n);
    try { localStorage.setItem('seating-snap-grid', n ? '1' : '0'); } catch {}
  };
  const [shiftHeld, setShiftHeld] = useState(false);
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const marqueeRef = useRef(marquee);
  marqueeRef.current = marquee;
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [seatsToAdd, setSeatsToAdd] = useState(10);
  const [error, setError] = useState('');
  const [fontTick, setFontTick] = useState(0);
  const [tip, setTip] = useState<ChairTip | null>(null);
  const [dropHint, setDropHint] = useState<{ tableId: string; seat: number | null } | null>(null);
  const [picker, setPicker] = useState<{ tableId: string; seat: number; x: number; y: number } | null>(null);
  const [presetOver, setPresetOver] = useState(false);
  const [copies, setCopies] = useState(1);

  const wrapRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<View>({ scale: 40, x: 400, y: 300 });
  const viewInit = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  const nodeRefs = useRef(new Map<string, Konva.Group>());
  const trRef = useRef<Konva.Transformer>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ----- load / save -----
  useEffect(() => {
    try {
      try {
        const u = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}');
        if (u && typeof u === 'object') {
          const clean: Record<string, number> = {};
          for (const [k, v] of Object.entries(u)) if (/^(round|rect):\d{1,2}$/.test(k) && typeof v === 'number' && Number.isFinite(v)) clean[k] = Math.min(v, 100000);
          setUsage(clean);
        }
      } catch {
        /* ignore */
      }
      const raw = initial ? null : localStorage.getItem(STORAGE_KEY);
      if (initial) setLayout(initial);
      else if (raw) setLayout(parseLayout(JSON.parse(raw)));
    } catch {
      /* ignore broken saved data */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (onChange) {
      onChange(layout);
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      /* storage full or blocked */
    }
  }, [layout, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    } catch {
      /* ignore */
    }
  }, [usage, hydrated]);

  const bumpUsage = (shape: 'round' | 'rect', seats: number, by = 1) =>
    setUsage((u) => ({ ...u, [`${shape}:${seats}`]: (u[`${shape}:${seats}`] ?? 0) + by }));

  /** Most-used table sizes first; unused defaults fill the remaining slots. */
  const presets = useMemo(() => {
    const seen = new Map<string, { shape: 'round' | 'rect'; seats: number; n: number; order: number }>();
    DEFAULT_PRESETS.forEach((d, i) => seen.set(`${d.shape}:${d.seats}`, { ...d, n: 0, order: i }));
    for (const [k, n] of Object.entries(usage)) {
      const [shape, seats] = k.split(':');
      const cur = seen.get(k);
      if (cur) cur.n = n;
      else seen.set(k, { shape: shape as 'round' | 'rect', seats: Number(seats), n, order: 100 });
    }
    return [...seen.values()].sort((a, b) => b.n - a.n || a.order - b.order).slice(0, PRESET_SLOTS);
  }, [usage]);

  // canvas text uses the bundled Arabic font; redraw once it is ready
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    document.fonts.load(`16px ${FONT.split(',')[0]}`).then(() => setFontTick((n) => n + 1)).catch(() => {});
  }, []);

  // ----- canvas size -----
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        setSize({ w: el.clientWidth, h: el.clientHeight });
        setMeasured(true);
      }
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Start with the origin centered, and keep the view centered when the canvas is resized.
  const prevSize = useRef<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (size.w < 50) return;
    if (!viewInit.current) {
      viewInit.current = true;
      setView({ scale: 40, x: size.w / 2, y: size.h / 2 });
    } else if (prevSize.current) {
      const dx = (size.w - prevSize.current.w) / 2;
      const dy = (size.h - prevSize.current.h) / 2;
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    }
    prevSize.current = size;
  }, [size]);

  // ----- editing helpers -----
  const commit = useCallback((next: Layout, key = '') => {
    const now = Date.now();
    const coalesce = key !== '' && lastEdit.current.key === key && now - lastEdit.current.time < 800;
    if (!coalesce) {
      past.current.push(layoutRef.current);
      if (past.current.length > 60) past.current.shift();
    }
    future.current = [];
    lastEdit.current = { key, time: now };
    setLayout(next);
  }, []);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (prev) {
      future.current.push(layoutRef.current);
      lastEdit.current = { key: '', time: 0 };
      setLayout(prev);
    }
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (next) {
      past.current.push(layoutRef.current);
      lastEdit.current = { key: '', time: 0 };
      setLayout(next);
    }
  }, []);

  const patchEl = useCallback(
    (id: string, patch: Partial<Element>, key = '') => {
      const l = layoutRef.current;
      if (lockedRef.current && ('x' in patch || 'y' in patch || 'rotation' in patch)) {
        setToast(lockMsgRef.current);
        return;
      }
      commit({ ...l, elements: l.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as Element) : e)) }, key ? `${id}:${key}` : '');
    },
    [commit],
  );

  const patchSettings = (patch: Partial<Settings>, key: string) => {
    const l = layoutRef.current;
    commit({ ...l, settings: { ...l.settings, ...patch } }, `settings:${key}`);
  };

  const setGuests = useCallback(
    (guests: Guest[], key = '') => commit({ ...layoutRef.current, guests }, key),
    [commit],
  );

  const viewCenter = () => ({
    x: snapV((size.w / 2 - view.x) / view.scale),
    y: snapV((size.h / 2 - view.y) / view.scale),
  });

  const makeElement = (sp: Spec, x: number, y: number): Element => {
    const l = layoutRef.current;
    if (sp.kind === 'table') {
      const n = l.elements.filter((e) => e.kind === 'table').length + 1;
      return { ...newTable(x, y, sp.shape, clamp(Math.round(sp.seats), LIMITS.seatsMin, LIMITS.seatsMax), n), label: `${t('table')} ${n}` };
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
  const addTableAt = (shape: 'round' | 'rect', seats: number, x: number, y: number) => addSpecAt({ kind: 'table', shape, seats }, x, y);

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

  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;

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
    setPendingDelete({ text: STRINGS[langRef.current].confirmRemoveTables.replace('{n}', String(tableIds.length)).replace('{k}', String(seated)), run });
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
          : ({ ...e, rotation: turn(e.rotation), ...(picked.length > 1 ? { x: round2(cx - (e.y - cy)), y: round2(cy + (e.x - cx)) } : {}) } as Element),
      ),
    });
  };

  const emptyTable = (tableId: string) => {
    const l = layoutRef.current;
    commit({ ...l, guests: l.guests.map((g) => (g.tableId === tableId ? { ...g, tableId: null, seat: null } : g)) });
  };

  // ----- selecting several -----
  const selectElement = (id: string, toggle: boolean) => {
    setMenu(null);
    const cur = selectionRef.current;
    if (toggle) setSelection(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    else if (selectTool) setSelection(cur.includes(id) ? cur : [...cur, id]);
    else if (!cur.includes(id)) setSelection([id]); // pressing on a selected item keeps the group so it can be dragged
  };

  const groupDrag = useRef<{ id: string; starts: Map<string, { x: number; y: number }> } | null>(null);
  const onDragStartEl = (id: string) => {
    const sel = selectionRef.current;
    if (sel.length > 1 && sel.includes(id)) {
      const starts = new Map<string, { x: number; y: number }>();
      for (const e of layoutRef.current.elements) if (sel.includes(e.id)) starts.set(e.id, { x: e.x, y: e.y });
      groupDrag.current = { id, starts };
    } else {
      groupDrag.current = null;
      if (!sel.includes(id)) setSelection([id]);
    }
  };
  const onDragMoveEl = (id: string, x: number, y: number) => {
    const g = groupDrag.current;
    if (!g || g.id !== id) return;
    const s0 = g.starts.get(id);
    if (!s0) return;
    for (const [oid, p] of g.starts) if (oid !== id) nodeRefs.current.get(oid)?.position({ x: p.x + x - s0.x, y: p.y + y - s0.y });
    nodeRefs.current.get(id)?.getLayer()?.batchDraw();
  };
  const onMoveEl = (id: string, x: number, y: number) => {
    if (lockedRef.current) return;
    const g = groupDrag.current;
    groupDrag.current = null;
    const s0 = g?.starts.get(id);
    if (g && s0) {
      const dx = x - s0.x;
      const dy = y - s0.y;
      const l = layoutRef.current;
      commit({
        ...l,
        elements: l.elements.map((e) => {
          const p = g.starts.get(e.id);
          return p ? ({ ...e, x: round2(p.x + dx), y: round2(p.y + dy) } as Element) : e;
        }),
      });
    } else patchEl(id, { x, y });
  };

  const selectAll = () => setSelection(layoutRef.current.elements.map((e) => e.id));

  /** Two fingers: zoom around their midpoint and follow them (pan). Returns true while pinching. */
  const handlePinch = (e: Konva.KonvaEventObject<TouchEvent>): boolean => {
    const t2 = e.evt.touches;
    if (t2.length !== 2) {
      pinch.current = null;
      return false;
    }
    e.evt.preventDefault();
    stageRef.current?.stopDrag();
    nodeRefs.current.forEach((n) => n.stopDrag());
    setMarquee(null);
    const r = wrapRef.current?.getBoundingClientRect();
    const a = { x: t2[0].clientX - (r?.left ?? 0), y: t2[0].clientY - (r?.top ?? 0) };
    const b = { x: t2[1].clientX - (r?.left ?? 0), y: t2[1].clientY - (r?.top ?? 0) };
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const last = pinch.current;
    pinch.current = { dist };
    if (!last || last.dist === 0) return true;
    const v = viewRef.current;
    const scale = clamp(v.scale * (dist / last.dist), 3, 200);
    const mx = (c.x - v.x) / v.scale;
    const my = (c.y - v.y) / v.scale;
    const next = { scale, x: c.x - mx * scale, y: c.y - my * scale };
    viewRef.current = next;
    setView(next);
    return true;
  };

  const peopleToolRef = useRef(peopleTool);
  peopleToolRef.current = peopleTool;
  const shiftHeldRef = useRef(shiftHeld);
  shiftHeldRef.current = shiftHeld;
  const finishMarquee = () => {
    const m = marqueeRef.current;
    marqueeRef.current = null;
    setMarquee(null);
    if (!m) return;
    const peopleTool = peopleToolRef.current;
    const shiftHeld = shiftHeldRef.current;
    const v = viewRef.current;
    if (Math.abs(m.x1 - m.x0) < 4 && Math.abs(m.y1 - m.y0) < 4) {
      if (peopleTool) setPeopleSel([]);
      else if (!shiftHeld) setSelection([]);
      return;
    }
    const x0 = (Math.min(m.x0, m.x1) - v.x) / v.scale;
    const x1 = (Math.max(m.x0, m.x1) - v.x) / v.scale;
    const y0 = (Math.min(m.y0, m.y1) - v.y) / v.scale;
    const y1 = (Math.max(m.y0, m.y1) - v.y) / v.scale;
    if (peopleTool) {
      const l = layoutRef.current;
      const hit = l.guests
        .filter((g) => {
          const c = chairWorld(l.elements, l.settings, g);
          return !!c && c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1;
        })
        .map((g) => g.id);
      setPeopleSel((cur) => [...new Set([...cur, ...hit])]);
      return;
    }
    const inside = layoutRef.current.elements.filter((e) => e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1).map((e) => e.id);
    setSelection(shiftHeld ? [...new Set([...selectionRef.current, ...inside])] : inside);
  };
  const marqueeMode = selectTool || shiftHeld || peopleTool;

  // ----- right-click / long-press menu -----
  const targetOf = (node: Konva.Node | null): MenuState['target'] => {
    let n: Konva.Node | null = node;
    while (n && n.getParent()) {
      const nm = n.name();
      if (nm.startsWith('chair|')) {
        const [, tableId, seat] = nm.split('|');
        return { kind: 'chair', tableId, seat: Number(seat) };
      }
      const id = n.id();
      if (id && layoutRef.current.elements.some((e) => e.id === id)) return { kind: 'element', id };
      n = n.getParent();
    }
    return { kind: 'blank' };
  };

  const openMenu = (node: Konva.Node | null, cx: number, cy: number) => {
    const target = targetOf(node);
    const w = worldFromClient(cx, cy);
    setTip(null);
    if (target.kind === 'element' && !selectionRef.current.includes(target.id)) setSelection([target.id]);
    if (target.kind === 'chair' && !selectionRef.current.includes(target.tableId)) setSelection([target.tableId]);
    setMenu({ x: cx, y: cy, wx: w.x, wy: w.y, target });
  };

  const longPress = useRef<{ timer: number; x: number; y: number; ready?: boolean } | null>(null);
  /** When a finger last touched the canvas. Android fires its own long-press "contextmenu" (sometimes as a plain mouse event); it must never open the menu. */
  const lastTouchAt = useRef(0);
  const cancelLongPress = () => {
    if (longPress.current) window.clearTimeout(longPress.current.timer);
    longPress.current = null;
  };

  const menuItems = (m: MenuState): MenuItem[] => {
    const l = layoutRef.current;
    if (m.target.kind === 'chair') {
      const { tableId, seat } = m.target;
      const occ = l.guests.find((g) => g.tableId === tableId && g.seat === seat);
      const party = occ ? inviteDrafts(l.guests).find((d) => d.guestId === occ.id || d.memberIds.includes(occ.id)) : undefined;
      const partyIds = party ? [party.guestId, ...party.memberIds].filter((id) => l.guests.some((g) => g.id === id && g.tableId)) : [];
      return [
        { label: occ ? t('changeGuest') : t('seatGuestHere'), onClick: () => setPicker({ tableId, seat, x: m.x, y: m.y }) },
        ...(occ ? [{ label: `${t('emptyChair')} (${occ.name})`, onClick: () => emptyChair(occ.id) }] : []),
        ...(partyIds.length > 1
          ? [{
              label: `${t('selectParty')} (${partyIds.length})`,
              onClick: () => {
                setPeopleSel(partyIds);
                setPeopleTool(true);
                setSelectTool(false);
                setToast(t('partySelected'));
              },
            }]
          : []),
      ];
    }
    if (m.target.kind === 'element') {
      const sel = selectionRef.current;
      const many = sel.length > 1;
      const only = !many ? l.elements.find((e) => e.id === sel[0]) : undefined;
      const items: MenuItem[] = [
        { label: many ? `${t('duplicate')} (${sel.length})` : only?.kind === 'table' ? `${t('copyTable')} (${only.seats})` : t('duplicate'), onClick: duplicateSelected },
        { label: t('rotate90'), onClick: rotateSelected },
      ];
      const tablesSel = sel.map((id) => l.elements.find((e) => e.id === id)).filter((e): e is TableEl => !!e && e.kind === 'table');
      if (tablesSel.length > 0) {
        const toRect = tablesSel.some((x) => x.shape === 'round');
        items.push({ label: toRect ? t('makeRect') : t('makeRound'), onClick: () => setShape(tablesSel.map((x) => x.id), toRect ? 'rect' : 'round') });
      }
      if (only && only.kind === 'table' && l.guests.some((g) => g.tableId === only.id)) {
        items.push({ label: t('emptyTable'), onClick: () => emptyTable(only.id) });
      }
      items.push('sep', { label: many ? `${t('remove')} (${sel.length})` : t('remove'), danger: true, onClick: removeSelected });
      return items;
    }
    const at = (make: (x: number, y: number) => Element) => () => {
      if (l.elements.length >= LIMITS.maxElements) return;
      const el = make(snapV(m.wx), snapV(m.wy));
      commit({ ...l, elements: [...l.elements, el] });
      setSelectedId(el.id);
    };
    return [
      { label: `+ ${t('roundTable')} (${seatsToAdd})`, onClick: () => addTableAt('round', seatsToAdd, m.wx, m.wy) },
      { label: `+ ${t('rectTable')} (${seatsToAdd})`, onClick: () => addTableAt('rect', seatsToAdd, m.wx, m.wy) },
      { label: `+ ${t('roundColumn')}`, onClick: at((x, y) => ({ ...newColumn(x, y, 'circle'), label: t('column') })) },
      { label: `+ ${t('squareColumn')}`, onClick: at((x, y) => ({ ...newColumn(x, y, 'square'), label: t('column') })) },
      'sep',
      { label: t('selectAll'), disabled: l.elements.length === 0, onClick: selectAll },
    ];
  };


  /** Copies the selected table (same shape, chairs and angle, no guests) in a row beside it. */
  const copyTable = () => {
    const l = layoutRef.current;
    const src = l.elements.find((e) => e.id === selectedId);
    if (!src || src.kind !== 'table') return;
    const f = tableFootprint(src, l.settings);
    const step = Math.ceil(((f.type === 'circle' ? f.r * 2 : Math.max(f.w, f.h)) + l.settings.walkway) * 10) / 10;
    const room = Math.max(0, LIMITS.maxElements - l.elements.length);
    const count = Math.min(copies, room);
    let n = l.elements.filter((e) => e.kind === 'table').length;
    const made: Element[] = [];
    for (let k = 1; k <= count; k++) {
      n += 1;
      made.push({ ...src, id: uid(), x: round2(src.x + step * k), label: `${t('table')} ${n}` });
    }
    if (made.length === 0) return;
    commit({ ...l, elements: [...l.elements, ...made] });
    bumpUsage(src.shape, src.seats, made.length);
    setSelectedId(made[made.length - 1].id);
  };

  // ----- table metrics view -----
  const removeOne = (id: string) => {
    const run = () => {
      const l = layoutRef.current;
      commit({
        ...l,
        elements: l.elements.filter((e) => e.id !== id),
        guests: l.guests.map((g) => (g.tableId === id ? { ...g, tableId: null, seat: null } : g)),
      });
      setSelection((cur) => cur.filter((x) => x !== id));
    };
    const seated = layoutRef.current.guests.filter((g) => g.tableId === id).length;
    setPendingDelete({ text: t('confirmRemoveTables').replace('{n}', '1').replace('{k}', String(seated)), run });
  };
  const setAllSeats = (seats: number) => {
    const l = layoutRef.current;
    const elements = l.elements.map((e) => (e.kind === 'table' ? { ...e, seats } : e));
    commit({ ...l, elements, guests: normalizeSeats(elements, l.guests) });
  };
  /** Zoom (moderately) onto a guest's chair and select their table. */
  const locateGuestId = (guestId: string): boolean => {
    const l = layoutRef.current;
    const g = l.guests.find((x) => x.id === guestId);
    if (!g || !g.tableId) return false;
    const spot = chairWorld(l.elements, l.settings, g) ?? l.elements.find((e) => e.id === g.tableId);
    if (!spot) return false;
    const scale = clamp(size.w / 11, 32, 80);
    setViewTab('hall');
    setSelection([g.tableId]);
    setView({ scale, x: size.w / 2 - spot.x * scale, y: size.h / 2 - spot.y * scale });
    return true;
  };
  const locate = (id: string) => {
    const el = layoutRef.current.elements.find((e) => e.id === id);
    setViewTab('hall');
    setSelection([id]);
    if (el) setView((v) => {
      const scale = Math.max(v.scale, 40);
      return { scale, x: size.w / 2 - el.x * scale, y: size.h / 2 - el.y * scale };
    });
  };

  // ----- picking a guest for a chair (double-click) -----
  const pickGuest = (guestId: string) => {
    if (!picker) return;
    const l = layoutRef.current;
    commit({ ...l, guests: seatGuest(l.guests, guestId, picker.tableId, picker.seat) });
    setSelectedId(picker.tableId);
    setPicker(null);
  };
  const addAndSeat = (name: string) => {
    if (!picker) return;
    const l = layoutRef.current;
    const g = newGuest(name.slice(0, LIMITS.nameMax), '', null, false);
    commit({ ...l, guests: seatGuest([...l.guests, g], g.id, picker.tableId, picker.seat) });
    setSelectedId(picker.tableId);
    setPicker(null);
  };
  const editGuest = (id: string, patch: Partial<Guest>) => {
    const l = layoutRef.current;
    commit({ ...l, guests: l.guests.map((g) => (g.id === id ? { ...g, ...patch, name: (patch.name ?? g.name).slice(0, LIMITS.nameMax), group: (patch.group ?? g.group).slice(0, LIMITS.nameMax) } : g)) }, `guest:${id}`);
  };
  const removeGuestById = (id: string) => {
    const name = layoutRef.current.guests.find((g) => g.id === id)?.name ?? '';
    setPicker(null);
    setPendingDelete({
      text: t('confirmRemoveGuest').replace('{name}', name),
      run: () => {
        const l = layoutRef.current;
        commit({ ...l, guests: l.guests.filter((g) => g.id !== id) });
      },
    });
  };
  const [guestEdit, setGuestEdit] = useState<{ id: string; x: number; y: number } | null>(null);
  /** Double-click on an element: select it and show its properties in the side panel. */
  const openProps = (id: string) => {
    setSelection([id]);
    setSheetOpen(true);
    window.setTimeout(() => {
      const box = document.querySelector('.side [data-props]');
      box?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      (box?.querySelector('input[type=text]') as HTMLInputElement | null)?.focus({ preventScroll: true });
    }, 60);
  };
  /** Turn the given tables round or rectangular; chairs and guests stay with them. */
  const setShape = (ids: string[], shape: 'round' | 'rect') => {
    const l = layoutRef.current;
    commit({ ...l, elements: l.elements.map((e) => (e.kind === 'table' && ids.includes(e.id) ? ({ ...e, shape, ...(shape === 'round' ? { half: undefined } : {}) } as Element) : e)) });
  };
  const emptyChair = (guestId: string) => {
    const l = layoutRef.current;
    commit({ ...l, guests: seatGuest(l.guests, guestId, null, null) });
    setPicker(null);
  };

  const changeSeats = (id: string, seats: number) => {
    const l = layoutRef.current;
    const elements = l.elements.map((e) => (e.id === id ? ({ ...e, seats } as Element) : e));
    commit({ ...l, elements, guests: normalizeSeats(elements, l.guests) }, `${id}:seats`);
  };

  // ----- seating guests by drag and drop -----
  /** Which table and chair a drop at this world position means, if any. */
  const resolveDrop = (wx: number, wy: number, ignoreId?: string) => {
    const l = layoutRef.current;
    const c = nearestChair(l.elements, l.settings, wx, wy, 0.6);
    if (c) return { tableId: c.tableId, seat: c.seat as number | null };
    const tb = tableAt(l.elements, l.settings, wx, wy);
    if (tb) return { tableId: tb.id, seat: firstFreeSeat(tb, l.guests, ignoreId) };
    return null;
  };

  const idsOfGroup = (group: string) => layoutRef.current.guests.filter((g) => g.group === group && !g.tableId).map((g) => g.id);

  /** Seat several guests at the table (or chair) under a drop point, filling chairs in order. */
  const dropMany = (ids: string[], wx: number, wy: number) => {
    const l = layoutRef.current;
    const r = resolveDrop(wx, wy);
    if (!r || ids.length === 0) return;
    const res = seatMany(l.elements, l.settings, l.guests, ids, r.tableId, r.seat);
    if (res.placed > 0) {
      commit({ ...l, guests: res.guests });
      setSelectedId(r.tableId);
    }
    setToast(res.left > 0 ? `${res.placed} ${t('seatedN')} · ${res.left} ${t('didNotFit')}` : `${res.placed} ${t('seatedN')}`);
  };

  const dropGuest = (guestId: string, wx: number, wy: number) => {
    const sel = peopleSelRef.current;
    if (sel.length > 1 && sel.includes(guestId)) {
      dropMany([guestId, ...sel.filter((x) => x !== guestId)], wx, wy);
      setPeopleSel([]);
      return;
    }
    const l = layoutRef.current;
    const me = l.guests.find((g) => g.id === guestId);
    const r = resolveDrop(wx, wy, guestId);
    if (!me || !r) return;
    if (me.tableId === r.tableId && me.seat === r.seat) return; // dropped back where it was
    commit({ ...l, guests: seatGuest(l.guests, guestId, r.tableId, r.seat) });
    setSelectedId(r.tableId);
  };

  const worldFromClient = (cx: number, cy: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { x: (cx - (r?.left ?? 0) - view.x) / view.scale, y: (cy - (r?.top ?? 0) - view.y) / view.scale };
  };

  useEffect(() => {
    if (!addOpen) return;
    const down = (e: Event) => {
      const n = e.target as Node;
      if (addRef.current?.contains(n) || addBtnRef.current?.contains(n)) return;
      setAddOpen(false);
    };
    const gone = () => { setDragHide(false); setAddOpen(false); };
    const tdrag = (e: Event) => {
      const ph = (e as CustomEvent).detail;
      if (ph === 'start') setDragHide(true);
      else gone();
    };
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('dragend', gone);
    window.addEventListener('drop', gone);
    window.addEventListener('seat-touchdrag', tdrag);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('dragend', gone);
      window.removeEventListener('drop', gone);
      window.removeEventListener('seat-touchdrag', tdrag);
    };
  }, [addOpen]);

  // ----- touch drag (hold an item, then drag it into the hall) -----
  const touchDrop = useRef<(p: TouchPayload, x: number, y: number, over: boolean, final: boolean) => void>(() => {});
  touchDrop.current = (p, x, y, over, final) => {
    const w = worldFromClient(x, y);
    if (p.kind === 'preset') {
      setPresetOver(over && !final);
      if (final && over) {
        const sp = parseSpec(p.value);
        if (sp) addSpecAt(sp, w.x, w.y);
      }
    } else {
      const ids = p.kind === 'group' ? idsOfGroup(p.value) : p.kind === 'guests' ? p.value.split(',').filter(Boolean) : [p.value];
      if (final) {
        setDropHint(null);
        if (!over) return;
        if (ids.length === 1) dropGuest(ids[0], w.x, w.y);
        else {
          dropMany(ids, w.x, w.y);
          if (p.kind === 'guests') setPeopleSel([]);
        }
      } else {
        const r = over ? resolveDrop(w.x, w.y) : null;
        setDropHint((prev) => (prev?.tableId === r?.tableId && prev?.seat === r?.seat ? prev : r));
      }
    }
  };
  useEffect(() => {
    let pending: { timer: number; x: number; y: number; el: HTMLElement } | null = null;
    let active: { p: TouchPayload; ghost: HTMLElement; x: number; y: number } | null = null;
    const cancelPending = () => {
      if (pending) window.clearTimeout(pending.timer);
      pending = null;
    };
    const overHall = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      return !!(hit && wrapRef.current?.contains(hit));
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!active) return;
      e.preventDefault();
      const t0 = e.touches[0];
      if (!t0) return;
      active.x = t0.clientX;
      active.y = t0.clientY;
      active.ghost.style.transform = `translate(${t0.clientX}px, ${t0.clientY}px) translate(-50%, -130%)`;
      touchDrop.current(active.p, t0.clientX, t0.clientY, overHall(t0.clientX, t0.clientY), false);
    };
    const end = (cancelled: boolean) => {
      const a = active;
      if (!a) return;
      active = null;
      document.removeEventListener('touchmove', onTouchMove, true);
      document.removeEventListener('touchend', onEnd, true);
      document.removeEventListener('touchcancel', onCancel, true);
      a.ghost.remove();
      window.dispatchEvent(new CustomEvent('seat-touchdrag', { detail: 'end' }));
      touchDrop.current(a.p, a.x, a.y, !cancelled && overHall(a.x, a.y), true);
      // The finger lifting would otherwise also "click" the tile and add a second copy.
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      document.addEventListener('click', swallow, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener('click', swallow, true), 300);
    };
    const onEnd = () => end(false);
    const onCancel = () => end(true);
    const activate = (el: HTMLElement, x: number, y: number) => {
      const p = readPayload(el);
      if (!p) return;
      const ghost = document.createElement('div');
      ghost.className = 'touch-ghost';
      ghost.textContent = p.label;
      ghost.style.transform = `translate(${x}px, ${y}px) translate(-50%, -130%)`;
      document.body.appendChild(ghost);
      active = { p, ghost, x, y };
      setMenu(null);
      window.dispatchEvent(new CustomEvent('seat-touchdrag', { detail: 'start' }));
      navigator.vibrate?.(15);
      document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
      document.addEventListener('touchend', onEnd, true);
      document.addEventListener('touchcancel', onCancel, true);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tdrag]') as HTMLElement | null;
      if (!el) return;
      cancelPending();
      const x = e.clientX;
      const y = e.clientY;
      pending = { x, y, el, timer: window.setTimeout(() => { pending = null; activate(el, x, y); }, 320) };
    };
    const onMove = (e: PointerEvent) => {
      if (pending && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 8) cancelPending();
    };
    // Android shows its own hold menu (copy / select / "right click") when a finger rests on a person or chip for a moment;
    // that would pop up over the drag. Block it after any touch, except inside text fields where select and paste are needed.
    let lastTouch = 0;
    const markTouch = (e: PointerEvent) => { if (e.pointerType === 'touch') lastTouch = Date.now(); };
    const noNativeMenu = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable=true]')) return;
      if (active || pending || Date.now() - lastTouch < 3000) e.preventDefault();
    };
    document.addEventListener('pointerdown', markTouch, true);
    document.addEventListener('contextmenu', noNativeMenu, true);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', cancelPending, true);
    document.addEventListener('pointercancel', cancelPending, true);
    return () => {
      cancelPending();
      active?.ghost.remove();
      document.removeEventListener('pointerdown', markTouch, true);
      document.removeEventListener('contextmenu', noNativeMenu, true);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', cancelPending, true);
      document.removeEventListener('pointercancel', cancelPending, true);
      document.removeEventListener('touchmove', onTouchMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isGuestDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).some((t) => t === 'text/guest-id' || t === 'text/guest-ids' || t === 'text/guest-group');
  const isPresetDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('text/element-preset');

  const copyHandlerRef = useRef({ copy: () => {}, paste: () => {} });
  copyHandlerRef.current = { copy: copySelected, paste: pasteClipboard };
  // keyboard: delete, undo, redo, copy, paste
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!inHallRef.current) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectionRef.current.length > 0) {
        e.preventDefault();
        removeSelected();
      } else if (mod && k === 'a') {
        e.preventDefault();
        selectAll();
      } else if (mod && k === 'c' && selectionRef.current.length > 0) {
        e.preventDefault();
        copyHandlerRef.current.copy();
      } else if (mod && k === 'v') {
        e.preventDefault();
        copyHandlerRef.current.paste();
      } else if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape') {
        setPicker(null);
        setMenu(null);
        setMarquee(null);
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [removeSelected, undo, redo]);

  // Shift held = drag a selection box instead of panning
  useEffect(() => {
    const down = (e: KeyboardEvent) => e.key === 'Shift' && setShiftHeld(true);
    const up = (e: KeyboardEvent) => e.key === 'Shift' && setShiftHeld(false);
    const blur = () => setShiftHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // a box drawn on the canvas ends even if the button is released outside it
  useEffect(() => {
    if (!marquee) return;
    const up = () => finishMarquee();
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marquee !== null]);

  // ----- transformer (rotation handle) -----
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedId ? nodeRefs.current.get(selectedId) : undefined;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, layout, selection]);

  const register = useCallback((id: string, node: Konva.Group | null) => {
    if (node) nodeRefs.current.set(id, node);
    else nodeRefs.current.delete(id);
  }, []);

  // ----- checks -----
  const issues = useMemo(() => findIssues(layout.elements, layout.settings), [layout.elements, layout.settings]);
  const full = useMemo(() => overfullTables(layout.elements, layout.guests), [layout.elements, layout.guests]);
  const seated = useMemo(() => seatedCounts(layout.guests), [layout.guests]);
  const issueById = useMemo(() => {
    const m = new Map<string, IssueState>();
    for (const i of issues) {
      for (const id of [i.a, i.b]) {
        if (m.get(id) !== 'overlap') m.set(id, i.type);
      }
    }
    for (const tb of full) m.set(tb.id, 'overlap');
    return m;
  }, [issues, full]);
  const totals = useMemo(() => summarize(layout.elements), [layout.elements]);
  const nameById = (id: string) => layout.elements.find((e) => e.id === id)?.label || '?';
  const tables = useMemo(() => layout.elements.filter((e): e is TableEl => e.kind === 'table'), [layout.elements]);
  const seatMap = useMemo(() => {
    const m = new Map<string, (Guest | undefined)[]>();
    for (const tb of tables) m.set(tb.id, new Array<Guest | undefined>(tb.seats).fill(undefined));
    for (const g of layout.guests) {
      if (g.tableId && g.seat !== null) {
        const arr = m.get(g.tableId);
        if (arr && g.seat < arr.length) arr[g.seat] = g;
      }
    }
    return m;
  }, [tables, layout.guests]);
  const guestsAtSelected = selected && selected.kind === 'table' ? layout.guests.filter((g) => g.tableId === selected.id) : [];

  // ----- view -----
  const fit = () => {
    const els = layout.elements;
    if (els.length === 0) {
      setView({ scale: 40, x: size.w / 2, y: size.h / 2 });
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of els) {
      let r = 1;
      if (e.kind === 'table') {
        const f = tableFootprint(e, layout.settings);
        r = f.type === 'circle' ? f.r : Math.hypot(f.w, f.h) / 2;
      } else if (e.kind === 'column') r = e.size / 2;
      else r = Math.hypot(e.w, e.h) / 2;
      minX = Math.min(minX, e.x - r);
      maxX = Math.max(maxX, e.x + r);
      minY = Math.min(minY, e.y - r);
      maxY = Math.max(maxY, e.y + r);
    }
    const pad = 1.5;
    const scale = clamp(Math.min(size.w / (maxX - minX + 2 * pad), size.h / (maxY - minY + 2 * pad)), 3, 120);
    setView({ scale, x: size.w / 2 - ((minX + maxX) / 2) * scale, y: size.h / 2 - ((minY + maxY) / 2) * scale });
  };

  // when a saved hall is loaded, start zoomed to show all of it
  const fitOnLoad = useRef(true);
  useEffect(() => {
    if (!hydrated || !measured || !fitOnLoad.current || size.w < 50) return;
    fitOnLoad.current = false;
    if (focusGuest && locateGuestId(focusGuest)) return;
    if (layout.elements.length > 0) fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, measured, size, layout]);

  const gridLines = useMemo(() => {
    const lines: { key: string; points: number[]; major: boolean }[] = [];
    const x0 = Math.floor(-view.x / view.scale) - 1;
    const x1 = Math.ceil((size.w - view.x) / view.scale) + 1;
    const y0 = Math.floor(-view.y / view.scale) - 1;
    const y1 = Math.ceil((size.h - view.y) / view.scale) + 1;
    const minorStep = view.scale >= 14 ? 1 : 5;
    for (let x = x0; x <= x1; x++) {
      if (x % minorStep !== 0) continue;
      lines.push({ key: `x${x}`, points: [x, y0, x, y1], major: x % 5 === 0 });
    }
    for (let y = y0; y <= y1; y++) {
      if (y % minorStep !== 0) continue;
      lines.push({ key: `y${y}`, points: [x0, y, x1, y], major: y % 5 === 0 });
    }
    return lines;
  }, [view, size]);

  // ----- files -----
  const exportFile = async () => {
    const json = JSON.stringify(layout, null, 2);
    // Inside the hosted demo the page cannot download by itself; its host offers a save dialog instead.
    const host = (window as unknown as { claude?: { use?: (n: string) => Promise<{ save: (o: { filename: string; data: string }) => Promise<unknown> } | null> } }).claude;
    if (host?.use) {
      try {
        const dl = await host.use('downloads');
        if (dl) {
          await dl.save({ filename: 'hall-layout.json', data: json });
          return;
        }
      } catch {
        return; // the viewer declined the save
      }
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hall-layout.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    setError('');
    try {
      if (file.size > 2_000_000) throw new Error('too big');
      const parsed = parseLayout(JSON.parse(await file.text()));
      commit(parsed);
      setSelectedId(null);
    } catch {
      setError(t('importError'));
    }
  };

  const [askClear, setAskClear] = useState(false);
  const clearAll = () => {
    if (layout.elements.length > 0) setAskClear(true);
  };
  const doClear = () => {
    const l = layoutRef.current;
    commit({ ...l, elements: [], guests: l.guests.map((g) => ({ ...g, tableId: null, seat: null })) });
    setSelectedId(null);
    setAskClear(false);
  };

  const dims = selected && selected.kind === 'table' ? tableDims(selected, layout.settings) : null;
  const canResize = !!selected && !layoutLocked && !peopleTool && selection.length <= 1;
  const footprint = selected && selected.kind === 'table' ? tableFootprint(selected, layout.settings) : null;

  const palette: { key: string; label: string; glyph: string; spec: () => Spec }[] = [
    { key: 'tr', label: t('roundTable'), glyph: 'round', spec: () => ({ kind: 'table', shape: 'round', seats: seatsToAdd }) },
    { key: 'tc', label: t('rectTable'), glyph: 'rect', spec: () => ({ kind: 'table', shape: 'rect', seats: seatsToAdd }) },
    { key: 'cc', label: t('roundColumn'), glyph: 'col-round', spec: () => ({ kind: 'column', shape: 'circle' }) },
    { key: 'cs', label: t('squareColumn'), glyph: 'col-square', spec: () => ({ kind: 'column', shape: 'square' }) },
    { key: 'zn', label: t('raisedArea'), glyph: 'zone', spec: () => ({ kind: 'zone' }) },
    ...MARKER_KINDS.map((k) => ({ key: `m-${k}`, label: markerLabel(k), glyph: `mk mk-${k}`, spec: (): Spec => ({ kind: 'marker', marker: k }) })),
  ];

  return (
    <div className="app" dir={dirOf(lang)} lang={lang}>
      {tip && (
        <div className="chair-tip" style={{ left: tip.x, top: tip.y }} dir="auto">
          {tip.text}
        </div>
      )}
      <header className="bar">
        {leading ?? <h1>{t('appTitle')}</h1>}
        <nav className="views" role="tablist">
          {([['hall', t('tabHall')], ['guests', t('tabGuests')], ['tables', t('tabTables')]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={view_ === k} className={view_ === k ? 'on' : ''} onClick={() => setViewTab(k)}>
              {label}
              {k === 'guests' && <span className="badge">{layout.guests.length}</span>}
              {k === 'tables' && <span className="badge">{tables.length}</span>}
            </button>
          ))}
        </nav>
        <div className="bar-actions">
          <IconButton icon="undo" label={`${t('undo')} (Ctrl+Z)`} onClick={undo} disabled={past.current.length === 0} />
          <IconButton icon="redo" label={`${t('redo')} (Ctrl+Y)`} onClick={redo} disabled={future.current.length === 0} />
          <span className="sep" aria-hidden />
          <IconButton icon="settings" label={t('appSettings')} onClick={() => setSettingsOpen(true)} />
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      {inHall && (
      <div className="tablebar" role="toolbar" aria-label={t('quickTables')}>
        <button
          ref={addBtnRef}
          className={`add-new primary${addOpen ? ' on' : ''}`}
          aria-expanded={addOpen}
          onClick={() => {
            const r = addBtnRef.current?.getBoundingClientRect();
            if (r) setAddPos({ y: r.bottom + 6, x: dirOf(lang) === 'rtl' ? Math.max(8, window.innerWidth - r.right) : Math.max(8, r.left) });
            setAddOpen(!addOpen);
          }}
        >
          <Icon name="plus" size={18} /> {t('addNew')}
        </button>
        <span className="sep" aria-hidden />
        <span className="tb-label">{t('quickTables')}</span>
        <span className="chip-group">
          {presets.map(({ shape, seats: n }) => (
            <button
              key={`${shape}${n}`}
              className="chip"
              draggable={!coarsePointer()}
              data-tdrag={`preset:${specToString({ kind: 'table', shape, seats: n })}`}
              title={`${t(shape === 'round' ? 'roundTable' : 'rectTable')} · ${n} — ${t('dragPreset')}`}
              aria-label={`${t(shape === 'round' ? 'roundTable' : 'rectTable')} ${n}`}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/element-preset', specToString({ kind: 'table', shape, seats: n }));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => addPreset({ kind: 'table', shape, seats: n })}
            >
              <span className={`glyph ${shape}`} aria-hidden />
              {n}
            </button>
          ))}
        </span>
        <span className="sep" aria-hidden />
        <label className="copies" title={t('copyHint')}>
          <span>{t('copies')}</span>
          <input type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(clamp(Math.round(Number(e.target.value) || 1), 1, 20))} />
        </label>
        <button className="copy-table" onClick={copyTable} disabled={!selected || selected.kind !== 'table'} title={t('copyHint')}>
          <Icon name="copy" size={18} /> {t('copyTable')}
          {selected && selected.kind === 'table' ? ` (${selected.seats})` : ''}
        </button>
      </div>
      )}

      {addOpen && addPos && (
        <div
          ref={addRef}
          className={`addpop${dragHide ? ' drag-hide' : ''}`}
          role="dialog"
          aria-label={t('addNew')}
          style={{ top: addPos.y, [dirOf(lang) === 'rtl' ? 'right' : 'left']: addPos.x }}
          onKeyDown={(e) => e.key === 'Escape' && setAddOpen(false)}
        >
            <NumField label={t('chairs')} value={seatsToAdd} min={LIMITS.seatsMin} max={LIMITS.seatsMax} step={1} int onChange={setSeatsToAdd} />
        <p className="muted">{t('paletteHint')}</p>
        <div className="palette">
          {palette.map((p) => (
            <button
              key={p.key}
              className="tile"
              draggable={!coarsePointer()}
              data-tdrag={`preset:${specToString(p.spec())}`}
              title={`${p.label} — ${t('paletteHint')}`}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/element-preset', specToString(p.spec()));
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => { addPreset(p.spec()); setAddOpen(false); }}
            >
              <span className={`pg ${p.glyph}`} aria-hidden />
              <span className="tile-label">{p.label}</span>
            </button>
          ))}
        </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      {settingsOpen && (
        <SettingsDialog
          account={account}
          t={t}
          snapGrid={snapGrid}
          toggleSnap={toggleSnap}
          locked={layoutLocked}
          toggleLock={toggleLock}
          onExport={exportFile}
          onImport={() => fileRef.current?.click()}
          onClear={() => { setSettingsOpen(false); clearAll(); }}
          clearDisabled={layout.elements.length === 0}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {pendingDelete && (
        <>
          <div className="picker-backdrop" onMouseDown={() => setPendingDelete(null)} />
          <div className="import-dialog confirm" role="alertdialog" aria-label={t('remove')} onKeyDown={(e) => e.key === 'Escape' && setPendingDelete(null)}>
            <p>{pendingDelete.text}</p>
            <div className="row">
              <button className="primary danger-fill" onClick={() => { const r = pendingDelete.run; setPendingDelete(null); r(); }} autoFocus>{t('remove')}</button>
              <button onClick={() => setPendingDelete(null)}>{t('importCancel')}</button>
            </div>
          </div>
        </>
      )}
      {askClear && (
        <>
          <div className="picker-backdrop" onMouseDown={() => setAskClear(false)} />
          <div className="import-dialog confirm" role="alertdialog" aria-label={t('clearAll')} onKeyDown={(e) => e.key === 'Escape' && setAskClear(false)}>
            <p>{t('confirmClear')}</p>
            <div className="row">
              <button className="primary danger-fill" onClick={doClear} autoFocus>{t('clearAll')}</button>
              <button onClick={() => setAskClear(false)}>{t('importCancel')}</button>
            </div>
          </div>
        </>
      )}

      {guestEdit && (() => {
        const g = layout.guests.find((x) => x.id === guestEdit.id);
        return g ? <GuestEditPopup t={t} guest={g} x={guestEdit.x} y={guestEdit.y} onEdit={editGuest} onRemoveGuest={removeGuestById} onClose={() => setGuestEdit(null)} /> : null;
      })()}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu)} onClose={() => setMenu(null)} />}

      {picker && (() => {
        const tb = tables.find((x) => x.id === picker.tableId);
        return tb ? (
          <ChairPicker
            t={t}
            table={tb}
            seat={picker.seat}
            x={picker.x}
            y={picker.y}
            guests={layout.guests}
            tableLabel={nameById}
            onPick={pickGuest}
            onAddAndSeat={addAndSeat}
            onEmpty={emptyChair}
            onEdit={editGuest}
            onRemoveGuest={removeGuestById}
            onClose={() => setPicker(null)}
          />
        ) : null;
      })()}

      <div className={`main${inHall ? '' : ' hidden'}`}>
        <div
          className={`canvas${dropHint || presetOver ? ' drop-ok' : ''}${marqueeMode ? ' select-mode' : ''}`}
          ref={wrapRef}
          onPointerDown={(e) => {
            if (e.pointerType !== 'touch') return;
            lastTouchAt.current = Date.now();
            cancelLongPress();
            const { clientX: x, clientY: y } = e;
            longPress.current = {
              x,
              y,
              timer: window.setTimeout(() => {
                // Held long enough: the menu opens when the finger lifts, so hold-then-drag never opens it.
                if (longPress.current) longPress.current.ready = true;
              }, 550),
            };
          }}
          onPointerMove={(e) => {
            const lp = longPress.current;
            if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) cancelLongPress();
          }}
          onPointerUp={(e) => {
            const lp = longPress.current;
            cancelLongPress();
            if (lp?.ready && e.pointerType === 'touch') {
              const r = wrapRef.current?.getBoundingClientRect();
              const node = r ? stageRef.current?.getIntersection({ x: lp.x - r.left, y: lp.y - r.top }) ?? null : null;
              openMenu(node, e.clientX, e.clientY);
            }
          }}
          onPointerCancel={cancelLongPress}
          onDragOver={(e) => {
            if (isPresetDrag(e)) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
              setPresetOver(true);
              return;
            }
            if (!isGuestDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const w = worldFromClient(e.clientX, e.clientY);
            const r = resolveDrop(w.x, w.y);
            setDropHint((prev) => (prev?.tableId === r?.tableId && prev?.seat === r?.seat ? prev : r));
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setDropHint(null);
              setPresetOver(false);
            }
          }}
          onDrop={(e) => {
            if (isPresetDrag(e)) {
              e.preventDefault();
              setPresetOver(false);
              const sp = parseSpec(e.dataTransfer.getData('text/element-preset'));
              if (sp) {
                const w = worldFromClient(e.clientX, e.clientY);
                addSpecAt(sp, w.x, w.y);
              }
              return;
            }
            if (!isGuestDrag(e)) return;
            e.preventDefault();
            const w = worldFromClient(e.clientX, e.clientY);
            setDropHint(null);
            const many = e.dataTransfer.getData('text/guest-ids');
            const group = e.dataTransfer.getData('text/guest-group');
            if (many) dropMany(many.split(',').filter(Boolean), w.x, w.y);
            else if (group) dropMany(idsOfGroup(group), w.x, w.y);
            else {
              const id = e.dataTransfer.getData('text/guest-id');
              if (id) dropGuest(id, w.x, w.y);
            }
          }}
        >
          <Stage
            ref={stageRef}
            width={size.w}
            height={size.h}
            x={view.x}
            y={view.y}
            scaleX={view.scale}
            scaleY={view.scale}
            draggable={!marqueeMode}
            onContextMenu={(e) => {
              e.evt.preventDefault();
              // Touch uses our own hold-and-release menu; Android's long-press contextmenu would open it mid-drag.
              if ((e.evt as PointerEvent).pointerType === 'touch' || Date.now() - lastTouchAt.current < 2500) return;
              openMenu(e.target, e.evt.clientX, e.evt.clientY);
            }}
            onDragStart={cancelLongPress}
            onDragEnd={(e) => {
              if (e.target === e.target.getStage()) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
            }}
            onMouseDown={(e) => {
              setMenu(null);
              if (e.target !== e.target.getStage() || (e.evt as MouseEvent).button === 2) return;
              const p = e.target.getStage()?.getPointerPosition();
              if (marqueeMode && p) setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
              else setSelection([]);
            }}
            onTouchStart={(e) => {
              lastTouchAt.current = Date.now();
              if (e.target !== e.target.getStage()) return;
              const p = e.target.getStage()?.getPointerPosition();
              if (marqueeMode && p) setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
              else setSelection([]);
            }}
            onMouseMove={(e) => {
              const p = e.target.getStage()?.getPointerPosition();
              if (marqueeRef.current && p) setMarquee({ ...marqueeRef.current, x1: p.x, y1: p.y });
            }}
            onTouchMove={(e) => {
              if (handlePinch(e)) return;
              const p = e.target.getStage()?.getPointerPosition();
              if (marqueeRef.current && p) setMarquee({ ...marqueeRef.current, x1: p.x, y1: p.y });
            }}
            onMouseUp={finishMarquee}
            onTouchEnd={(e) => {
              if (e.evt.touches.length < 2) pinch.current = null;
              finishMarquee();
            }}
            onWheel={(e) => {
              e.evt.preventDefault();
              const stage = e.target.getStage();
              const p = stage?.getPointerPosition();
              if (!p) return;
              const next = clamp(view.scale * (e.evt.deltaY < 0 ? 1.1 : 1 / 1.1), 3, 200);
              const mx = (p.x - view.x) / view.scale;
              const my = (p.y - view.y) / view.scale;
              setView({ scale: next, x: p.x - mx * next, y: p.y - my * next });
            }}
          >
            <Layer listening={false}>
              {gridLines.map((l) => (
                <Line key={l.key} points={l.points} stroke={theme === 'dark' ? (l.major ? '#3f424a' : '#2b2d33') : l.major ? '#cfc8b8' : '#e6e1d4'} strokeWidth={l.major ? 1.25 : 1} strokeScaleEnabled={false} />
              ))}
              <Line points={[0, -0.25, 0, 0.25]} stroke={theme === 'dark' ? '#7d796f' : '#9a9283'} strokeWidth={1} strokeScaleEnabled={false} />
              <Line points={[-0.25, 0, 0.25, 0]} stroke={theme === 'dark' ? '#7d796f' : '#9a9283'} strokeWidth={1} strokeScaleEnabled={false} />
            </Layer>
            <Layer key={`${fontTick}-${theme}`}>
              {[...layout.elements]
                .sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
                .map((el) => (
                  <ElementNode
                    key={el.id}
                    el={el}
                    settings={layout.settings}
                    issue={issueById.get(el.id)}
                    seated={el.kind === 'table' && layout.guests.length > 0 ? seated.get(el.id) ?? 0 : undefined}
                    seatGuests={el.kind === 'table' ? seatMap.get(el.id) : undefined}
                    highlightSeat={dropHint && dropHint.tableId === el.id ? dropHint.seat : null}
                    onChairDrop={dropGuest}
                    onChairTip={setTip}
                    scale={view.scale}
                    onChairOpen={(tableId, seat, x, y) => {
                      setTip(null);
                      setPicker({ tableId, seat, x, y });
                    }}
                    register={register}
                    multi={selection.length > 1 && selection.includes(el.id)}
                    onSelect={selectElement}
                    onDragStartEl={onDragStartEl}
                    onDragMoveEl={onDragMoveEl}
                    onMove={onMoveEl}
                    snapPos={(x, y, node) => (snapGrid ? snapToDrawnEdges(node, x, y) ?? snapToGridEdges(el, layout.settings, x, y, 1) : { x: snap(x, 0.1), y: snap(y, 0.1) })}
                    onOpenEl={openProps}
                    pickedIds={pickedSet}
                    onChairPick={peopleTool ? togglePerson : undefined}
                    locked={peopleTool || layoutLocked}
                  />
                ))}
              <Transformer
                ref={trRef}
                enabledAnchors={canResize ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []}
                resizeEnabled={canResize}
                keepRatio={!!selected && (selected.kind === 'table' || selected.kind === 'column')}
                flipEnabled={false}
                boundBoxFunc={(o, n) => (n.width < 12 || n.height < 12 ? o : n)}
                rotateEnabled={!layoutLocked}
                rotationSnaps={Array.from({ length: 24 }, (_, i) => i * 15)}
                rotationSnapTolerance={6}
                rotateAnchorOffset={28}
                borderStroke="#3b6fd4"
                anchorStroke="#3b6fd4"
                anchorSize={11}
                anchorCornerRadius={2}
                onTransformEnd={(e) => {
                  const node = e.target as unknown as Konva.Group;
                  const id = [...nodeRefs.current.entries()].find(([, n]) => n === node)?.[0];
                  if (!id) return;
                  let r = Math.round(node.rotation());
                  if (r > 180) r -= 360;
                  if (r < -180) r += 360;
                  const sx = Math.abs(node.scaleX());
                  const sy = Math.abs(node.scaleY());
                  const nx = node.x();
                  const ny = node.y();
                  node.scale({ x: 1, y: 1 });
                  const el = layoutRef.current.elements.find((x) => x.id === id);
                  if (!el || Math.abs(sx - 1) + Math.abs(sy - 1) < 0.001) {
                    patchEl(id, { rotation: r });
                    return;
                  }
                  if (lockedRef.current) {
                    setToast(lockMsgRef.current);
                    return;
                  }
                  const clampSize = (v: number) => Math.min(LIMITS.sizeMax, Math.max(LIMITS.sizeMin, round2(v)));
                  const l = layoutRef.current;
                  if (el.kind === 'table') {
                    const seats = Math.min(LIMITS.seatsMax, Math.max(LIMITS.seatsMin, Math.round(el.seats * sx)));
                    const elements = l.elements.map((x) => (x.id === id ? ({ ...x, seats, x: round2(nx), y: round2(ny), rotation: r } as Element) : x));
                    commit({ ...l, elements, guests: normalizeSeats(elements, l.guests) });
                  } else if (el.kind === 'column') {
                    patchEl(id, { size: clampSize(el.size * sx), x: round2(nx), y: round2(ny), rotation: r });
                  } else {
                    let w = clampSize(el.w * sx);
                    let h = clampSize(el.h * sy);
                    let x = nx;
                    let y = ny;
                    if (snapGrid && r % 90 === 0) {
                      // put the dragged edges on the grid lines
                      const swap = Math.abs(r) % 180 === 90;
                      const bw = swap ? h : w;
                      const bh = swap ? w : h;
                      const left = snap(nx - bw / 2, 1);
                      const right = Math.max(left + 1, snap(nx + bw / 2, 1));
                      const top = snap(ny - bh / 2, 1);
                      const bottom = Math.max(top + 1, snap(ny + bh / 2, 1));
                      x = (left + right) / 2;
                      y = (top + bottom) / 2;
                      if (swap) {
                        h = right - left;
                        w = bottom - top;
                      } else {
                        w = right - left;
                        h = bottom - top;
                      }
                    }
                    patchEl(id, { w: clampSize(w), h: clampSize(h), x: round2(x), y: round2(y), rotation: r });
                  }
                }}
              />
            </Layer>
          </Stage>
          {peopleSel.length > 0 && (
            <div className="pickbar" role="status">
              <b>{peopleSel.length}</b> {t('peopleSelected')}
              <button
                onClick={() => {
                  const l = layoutRef.current;
                  commit({ ...l, guests: l.guests.map((g) => (peopleSel.includes(g.id) ? { ...g, tableId: null, seat: null } : g)) });
                  setPeopleSel([]);
                }}
              >
                {t('unseatSelected')}
              </button>
              <button onClick={() => setPeopleSel([])}>{t('clearSelection')}</button>
            </div>
          )}
          <div className="scalebar" dir="ltr" aria-hidden>
            <div style={{ width: view.scale }} />
            <span>1 m</span>
          </div>
          <div className="hint">{t('hint')}</div>
          {marquee && (
            <div
              className="marquee"
              style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }}
            />
          )}
          <div className="fit">
            <IconButton icon="fit" label={t('fit')} onClick={fit} />
            <IconButton icon="grid" label={t('snapGrid')} pressed={snapGrid} onClick={toggleSnap} />
            <IconButton icon="lock" label={t('lockLayout')} pressed={layoutLocked} onClick={toggleLock} />
            <IconButton icon="select" label={t('selectTool')} pressed={selectTool} onClick={() => { setSelectTool(!selectTool); setPeopleTool(false); }} />
            <IconButton icon="users" label={t('peopleTool')} pressed={peopleTool} onClick={() => { setPeopleTool(!peopleTool); setSelectTool(false); }} />
          </div>
        </div>

        {inHall && (
        <aside className={`side${sheetOpen ? '' : ' collapsed'}`}>
          <button className="sheet-toggle" aria-expanded={sheetOpen} onClick={() => setSheetOpen(!sheetOpen)}>
            <span>{selected ? selected.label || t('properties') : `${t('properties')} · ${t('guestsToSeat')}`}</span>
            <span className="arrow" aria-hidden>{sheetOpen ? '▾' : '▴'}</span>
          </button>

          <section className="card" data-props>
            <h2>{t('properties')}</h2>
            {selection.length === 0 && <p className="muted">{t('nothingSelected')}</p>}
            {selection.length > 1 && (
              <>
                <p className="totals">{selection.length} {t('selectedItems')}</p>
                <div className="multi-actions">
                  <IconButton icon="copy" label={t('duplicate')} onClick={duplicateSelected} />
                  <button onClick={rotateSelected}>{t('rotate90')}</button>
                  <IconButton icon="trash" label={t('remove')} danger onClick={removeSelected} />
                </div>
              </>
            )}
            {selected && (
              <>
                <label className="field">
                  <span>{t('name')}</span>
                  <input type="text" maxLength={LIMITS.labelMax} value={selected.label} onChange={(e) => patchEl(selected.id, { label: e.target.value }, 'label')} />
                </label>
                {selected.kind === 'table' && (
                  <>
                    <div className="field">
                      <span>{t('shape')}</span>
                      <div className="seg" role="group" aria-label={t('shape')}>
                        {(['round', 'rect'] as const).map((sh) => (
                          <button key={sh} className={selected.shape === sh ? 'on' : ''} aria-pressed={selected.shape === sh} onClick={() => setShape([selected.id], sh)}>
                            <span className={`glyph ${sh}`} aria-hidden /> {t(sh === 'round' ? 'shapeRound' : 'shapeRect')}
                          </button>
                        ))}
                      </div>
                    </div>
                    {selected.shape === 'rect' && (
                      <label className="field check">
                        <input type="checkbox" checked={!!selected.half} onChange={(e) => { const l = layoutRef.current; commit({ ...l, elements: l.elements.map((x) => (x.id === selected.id && x.kind === 'table' ? ({ ...x, half: e.target.checked } as Element) : x)) }); }} />
                        <span>{t('halfTable')}</span>
                      </label>
                    )}
                    <NumField label={t('chairs')} value={selected.seats} min={LIMITS.seatsMin} max={LIMITS.seatsMax} step={1} int onChange={(v) => changeSeats(selected.id, v)} />
                    {dims?.shape === 'round' && <p className="muted">{t('diameter')}: {round2(dims.diameter)} m</p>}
                    {dims?.shape === 'rect' && <p className="muted">{t('length')}: {round2(dims.length)} m × {round2(dims.width)} m</p>}
                    {footprint && (
                      <p className="muted">
                        {t('withChairs')}: {footprint.type === 'circle' ? `${round2(footprint.r * 2)} m` : `${round2(footprint.w)} × ${round2(footprint.h)} m`}
                      </p>
                    )}
                    {guestsAtSelected.length > 0 && (
                      <div className="at-table">
                        <p className="muted">{t('guestsAtTable')} ({guestsAtSelected.length}/{selected.seats})</p>
                        <ul>
                          {guestsAtSelected.map((g) => (
                            <li key={g.id}>{g.seat !== null ? `${g.seat + 1}. ` : ''}{g.name}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
                {selected.kind === 'column' && (
                  <NumField label={t('size')} value={selected.size} min={LIMITS.sizeMin} max={LIMITS.sizeMax} onChange={(v) => patchEl(selected.id, { size: v }, 'size')} />
                )}
                {(selected.kind === 'zone' || selected.kind === 'marker') && (
                  <div className="two">
                    <NumField label={t('width')} value={selected.w} min={LIMITS.sizeMin} max={LIMITS.sizeMax} onChange={(v) => patchEl(selected.id, { w: v }, 'w')} />
                    <NumField label={t('depth')} value={selected.h} min={LIMITS.sizeMin} max={LIMITS.sizeMax} onChange={(v) => patchEl(selected.id, { h: v }, 'h')} />
                  </div>
                )}
                {selected.kind === 'zone' && (
                  <NumField label={t('steps')} value={selected.steps} min={0} max={50} step={1} int onChange={(v) => patchEl(selected.id, { steps: v }, 'steps')} />
                )}
                <NumField label={t('rotation')} value={selected.rotation} min={-360} max={360} step={5} onChange={(v) => patchEl(selected.id, { rotation: v }, 'rot')} />
                <div className="two">
                  <NumField label={t('posX')} value={selected.x} min={-LIMITS.coordMax} max={LIMITS.coordMax} onChange={(v) => patchEl(selected.id, { x: v }, 'x')} />
                  <NumField label={t('posY')} value={selected.y} min={-LIMITS.coordMax} max={LIMITS.coordMax} onChange={(v) => patchEl(selected.id, { y: v }, 'y')} />
                </div>
                <div className="row">
                  <IconButton icon="copy" label={t('duplicate')} onClick={duplicateSelected} />
                  <button onClick={rotateSelected}>{t('rotate90')}</button>
                  <IconButton icon="trash" label={t('remove')} danger onClick={removeSelected} />
                </div>
              </>
            )}
          </section>

          <section className="card">
            <h2>{t('guestsToSeat')}</h2>
            <SeatList t={t} guests={layout.guests} tables={tables} peopleTool={peopleTool} picked={pickedSet} onToggle={togglePerson} onEdit={(id, x, y) => setGuestEdit({ id, x, y })} />
          </section>

          <section className="card">
            <h2>{t('warnings')}</h2>
            <p className="totals">
              {t('tables')}: {totals.tables} · {t('seatsTotal')}: {totals.seats}
            </p>
            {issues.length === 0 && full.length === 0 && <p className="muted">{t('noWarnings')}</p>}
            <ul className="issues">
              {issues.map((i, idx) => (
                <li key={idx} className={i.type}>
                  <button onClick={() => setSelectedId(i.a)}>
                    <b>{t(i.type)}</b> {nameById(i.a)} / {nameById(i.b)}
                  </button>
                </li>
              ))}
              {full.map((tb) => (
                <li key={`full-${tb.id}`} className="overlap">
                  <button onClick={() => setSelectedId(tb.id)}>
                    <b>{t('overfull')}</b> {tb.label} ({seated.get(tb.id) ?? 0}/{tb.seats})
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {error && <p className="error" role="alert">{error}</p>}
          <p className="muted saved">{t('saved')}</p>
        </aside>
        )}
      </div>

      {view_ === 'guests' && <GuestsView
          t={t}
          guests={layout.guests}
          tables={tables}
          onChange={setGuests}
          onLocate={(g) => locateGuestId(g.id)}
          onAskRemove={removeGuestById}
          onImportAll={(added, made) => {
            const l = layoutRef.current;
            commit({ ...l, elements: [...l.elements, ...placeNewTables(l.elements, l.settings, made)], guests: [...l.guests, ...added] });
          }}
        />}
      {view_ === 'tables' && (
        <TablesView
          t={t}
          settings={layout.settings}
          tables={tables}
          seated={seated}
          onSettings={patchSettings}
          onPatchTable={(id, patch, key) => patchEl(id, patch as Partial<Element>, key)}
          onSeats={changeSeats}
          onAllSeats={setAllSeats}
          onLocate={locate}
          onRemove={removeOne}
        />
      )}
    </div>
  );
}
