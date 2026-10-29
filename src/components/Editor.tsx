'use client';

import type Konva from 'konva';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Stage, Transformer } from 'react-konva';
import {
  Element,
  Guest,
  Layout,
  LIMITS,
  Settings,
  TableEl,
  findIssues,
  normalizeSeats,
  chairWorld,
  overfullTables,
  parseLayout,
  seatedCounts,
  snap,
  summarize,
  tableFootprint,
  uid,
  snapToGridEdges,
} from '@/lib/layout';
import { Key, STRINGS, dirOf } from '@/lib/i18n';
import { ChairPicker } from './ChairPicker';
import { ContextMenu, MenuItem } from './ContextMenu';
import { applyPalette, ChairTip, ElementNode, FONT, IssueState } from './ElementNode';
import { round2 } from './NumField';
import { SeatList } from './SeatList';
import { TablesView } from './TablesView';
import SettingsDialog from './SettingsDialog';
import type { AccountProps } from './SettingsPanel';
import { useLang } from './LangProvider';
import { useTheme } from '@/lib/theme';
import { GuestEditPopup } from './ChairPicker';
import { clamp, DEFAULT_PRESETS, PRESET_SLOTS, USAGE_KEY } from './editor-specs';
import { QuickTablesBar } from './QuickTablesBar';
import { PropertiesCard } from './PropertiesCard';
import { WarningsCard } from './WarningsCard';
import { ConfirmDialog } from './editor/ConfirmDialog';
import { GridLayer } from './editor/GridLayer';
import { CanvasTools, MarqueeBox, PickBar, ScaleBar } from './editor/CanvasOverlays';
import { resizePatch } from './editor/resizeElement';
import { useEditorKeys, useShiftHeld } from './editor/useEditorKeys';
import { useLongPress } from './editor/useLongPress';
import { buildMenuItems, type MenuState } from './editor/contextMenuItems';
import { useLayoutHistory } from './editor/useLayoutHistory';
import { useHallDrop } from './editor/useHallDrop';
import { EditorHeader, type EditorView } from './editor/EditorHeader';
import { AddPopover } from './editor/AddPopover';
import { useElementActions } from './editor/useElementActions';
import { useSeatingActions } from './editor/useSeatingActions';
import { useTouchDrag } from './editor/useTouchDrag';

const STORAGE_KEY = 'seating-layout-v1';
const ORDER: Record<Element['kind'], number> = { zone: 0, marker: 1, table: 2, column: 3 };

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

  const { layout, setLayout, layoutRef, commit, undo, redo, canUndo, canRedo } = useLayoutHistory();
  const [hydrated, setHydrated] = useState(false);

  const [view_, setViewTab] = useState<EditorView>('hall');
  const inHall = view_ === 'hall';
  const [selection, setSelection] = useState<string[]>([]);
  const selectionRef = useRef<string[]>([]);
  selectionRef.current = selection;
  /** The one selected element, for the properties panel; null when none or several. */
  const selectedId = selection.length === 1 ? selection[0] : null;
  const setSelectedId = useCallback((id: string | null) => setSelection(id ? [id] : []), []);
  // phones start with the panel folded so the hall gets the screen (the editor only runs in the browser)
  const [sheetOpen, setSheetOpen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 760px)').matches,
  );
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
  const togglePerson = (id: string) =>
    setPeopleSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const [snapGrid, setSnapGrid] = useState(() => {
    try {
      return localStorage.getItem('seating-snap-grid') === '1';
    } catch {
      return false;
    }
  });
  const [layoutLocked, setLayoutLocked] = useState(() => {
    try {
      return localStorage.getItem('seating-layout-locked') === '1';
    } catch {
      return false;
    }
  });
  const lockedRef = useRef(layoutLocked);
  lockedRef.current = layoutLocked;
  const lockMsgRef = useRef('');
  lockMsgRef.current = t('layoutLocked');
  const toggleLock = () => {
    const n = !layoutLocked;
    setLayoutLocked(n);
    try {
      localStorage.setItem('seating-layout-locked', n ? '1' : '0');
    } catch {}
  };
  const [addOpen, setAddOpen] = useState(false);
  const [addPos, setAddPos] = useState<{ x: number; y: number } | null>(null);
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
    try {
      localStorage.setItem('seating-snap-grid', n ? '1' : '0');
    } catch {}
  };
  const shiftHeld = useShiftHeld();
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const marqueeRef = useRef(marquee);
  marqueeRef.current = marquee;
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [seatsToAdd, setSeatsToAdd] = useState(10);
  const [error, setError] = useState('');
  const [fontTick, setFontTick] = useState(0);
  const [tip, setTip] = useState<ChairTip | null>(null);
  const [picker, setPicker] = useState<{ tableId: string; seat: number; x: number; y: number } | null>(null);
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

  useEffect(() => {
    try {
      try {
        const u = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}');
        if (u && typeof u === 'object') {
          const clean: Record<string, number> = {};
          for (const [k, v] of Object.entries(u))
            if (/^(round|rect):\d{1,2}$/.test(k) && typeof v === 'number' && Number.isFinite(v))
              clean[k] = Math.min(v, 100000);
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
    document.fonts
      .load(`16px ${FONT.split(',')[0]}`)
      .then(() => setFontTick((n) => n + 1))
      .catch(() => {});
  }, []);

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

  const patchEl = useCallback(
    (id: string, patch: Partial<Element>, key = '') => {
      const l = layoutRef.current;
      if (lockedRef.current && ('x' in patch || 'y' in patch || 'rotation' in patch)) {
        setToast(lockMsgRef.current);
        return;
      }
      commit(
        { ...l, elements: l.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as Element) : e)) },
        key ? `${id}:${key}` : '',
      );
    },
    [commit],
  );

  const patchSettings = (patch: Partial<Settings>, key: string) => {
    const l = layoutRef.current;
    commit({ ...l, settings: { ...l.settings, ...patch } }, `settings:${key}`);
  };

  const viewCenter = () => ({
    x: snapV((size.w / 2 - view.x) / view.scale),
    y: snapV((size.h / 2 - view.y) / view.scale),
  });

  const {
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
  } = useElementActions({
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
  });
  const selected = layout.elements.find((e) => e.id === selectedId) ?? null;

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
    for (const [oid, p] of g.starts)
      if (oid !== id) nodeRefs.current.get(oid)?.position({ x: p.x + x - s0.x, y: p.y + y - s0.y });
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
    const inside = layoutRef.current.elements
      .filter((e) => e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1)
      .map((e) => e.id);
    setSelection(shiftHeld ? [...new Set([...selectionRef.current, ...inside])] : inside);
  };
  const marqueeMode = selectTool || shiftHeld || peopleTool;

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

  const { handlers: pressHandlers, cancel: cancelLongPress, lastTouchAt } = useLongPress(wrapRef, stageRef, openMenu);

  const menuItems = (m: MenuState): MenuItem[] =>
    buildMenuItems(m, {
      t,
      layout: layoutRef.current,
      selection: selectionRef.current,
      seatsToAdd,
      snapV,
      commit,
      setSelectedId,
      setPicker,
      setPeopleSel,
      setPeopleTool,
      setSelectTool,
      setToast,
      emptyChair,
      emptyTable,
      duplicateSelected,
      rotateSelected,
      setShape,
      removeSelected,
      addTableAt,
      selectAll,
    });

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
    if (el)
      setView((v) => {
        const scale = Math.max(v.scale, 40);
        return { scale, x: size.w / 2 - el.x * scale, y: size.h / 2 - el.y * scale };
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
  const {
    removeOne,
    setAllSeats,
    pickGuest,
    addAndSeat,
    editGuest,
    removeGuestById,
    setShape,
    emptyChair,
    changeSeats,
    resolveDrop,
    idsOfGroup,
    dropMany,
    dropGuest,
  } = useSeatingActions({
    t,
    layoutRef,
    peopleSelRef,
    commit,
    picker,
    setPicker,
    setSelection,
    setSelectedId,
    setPeopleSel,
    setToast,
    setPendingDelete,
  });

  const worldFromClient = (cx: number, cy: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { x: (cx - (r?.left ?? 0) - view.x) / view.scale, y: (cy - (r?.top ?? 0) - view.y) / view.scale };
  };

  const { dropHint, presetOver, dropHandlers, onTouchDrop } = useHallDrop({
    worldFromClient,
    resolveDrop,
    addSpecAt,
    dropGuest,
    dropMany,
    idsOfGroup,
    clearPeopleSel: () => setPeopleSel([]),
  });
  useTouchDrag(wrapRef, onTouchDrop, () => setMenu(null));

  useEditorKeys({
    enabled: inHallRef,
    hasSelection: () => selectionRef.current.length > 0,
    remove: removeSelected,
    selectAll,
    copy: copySelected,
    paste: pasteClipboard,
    undo,
    redo,
    escape: () => {
      setPicker(null);
      setMenu(null);
      setMarquee(null);
      setSelectedId(null);
    },
  });

  // a box drawn on the canvas ends even if the button is released outside it
  useEffect(() => {
    if (!marquee) return;
    const up = () => finishMarquee();
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [marquee !== null]);

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
  const guestsAtSelected =
    selected && selected.kind === 'table' ? layout.guests.filter((g) => g.tableId === selected.id) : [];

  const fit = () => {
    const els = layout.elements;
    if (els.length === 0) {
      setView({ scale: 40, x: size.w / 2, y: size.h / 2 });
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
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

  const fitOnLoad = useRef(true);
  useEffect(() => {
    if (!hydrated || !measured || !fitOnLoad.current || size.w < 50) return;
    fitOnLoad.current = false;
    if (focusGuest && locateGuestId(focusGuest)) return;
    if (layout.elements.length > 0) fit();
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

  const exportFile = async () => {
    const json = JSON.stringify(layout, null, 2);
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

  const canResize = !!selected && !layoutLocked && !peopleTool && selection.length <= 1;

  return (
    <div className="app" dir={dirOf(lang)} lang={lang}>
      {tip && (
        <div className="chair-tip" style={{ left: tip.x, top: tip.y }} dir="auto">
          {tip.text}
        </div>
      )}
      <EditorHeader
        t={t}
        leading={leading}
        view={view_}
        onView={setViewTab}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onSettings={() => setSettingsOpen(true)}
        fileRef={fileRef}
        onImportFile={(f) => void importFile(f)}
      />

      {inHall && (
        <QuickTablesBar
          t={t}
          presets={presets}
          addOpen={addOpen}
          addBtnRef={addBtnRef}
          onToggleAdd={() => {
            const r = addBtnRef.current?.getBoundingClientRect();
            if (r)
              setAddPos({
                y: r.bottom + 6,
                x: dirOf(lang) === 'rtl' ? Math.max(8, window.innerWidth - r.right) : Math.max(8, r.left),
              });
            setAddOpen(!addOpen);
          }}
          onAddPreset={addPreset}
          copies={copies}
          onCopies={setCopies}
          onCopyTable={copyTable}
          selected={selected}
        />
      )}

      {addOpen && addPos && (
        <AddPopover
          t={t}
          lang={lang}
          pos={addPos}
          seats={seatsToAdd}
          onSeats={setSeatsToAdd}
          markerLabel={markerLabel}
          anchorRef={addBtnRef}
          onAdd={addPreset}
          onClose={() => setAddOpen(false)}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

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
          onClear={() => {
            setSettingsOpen(false);
            clearAll();
          }}
          clearDisabled={layout.elements.length === 0}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {pendingDelete && (
        <ConfirmDialog
          label={t('remove')}
          text={pendingDelete.text}
          confirmLabel={t('remove')}
          cancelLabel={t('importCancel')}
          onConfirm={() => {
            const run = pendingDelete.run;
            setPendingDelete(null);
            run();
          }}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {askClear && (
        <ConfirmDialog
          label={t('clearAll')}
          text={t('confirmClear')}
          confirmLabel={t('clearAll')}
          cancelLabel={t('importCancel')}
          onConfirm={doClear}
          onCancel={() => setAskClear(false)}
        />
      )}

      {guestEdit &&
        (() => {
          const g = layout.guests.find((x) => x.id === guestEdit.id);
          return g ? (
            <GuestEditPopup
              t={t}
              guest={g}
              x={guestEdit.x}
              y={guestEdit.y}
              onEdit={editGuest}
              onRemoveGuest={removeGuestById}
              onClose={() => setGuestEdit(null)}
            />
          ) : null;
        })()}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu)} onClose={() => setMenu(null)} />}

      {picker &&
        (() => {
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
          {...pressHandlers}
          {...dropHandlers}
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
            <GridLayer lines={gridLines} dark={theme === 'dark'} />
            <Layer key={`${fontTick}-${theme}`}>
              {[...layout.elements]
                .sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
                .map((el) => (
                  <ElementNode
                    key={el.id}
                    el={el}
                    settings={layout.settings}
                    issue={issueById.get(el.id)}
                    seated={el.kind === 'table' && layout.guests.length > 0 ? (seated.get(el.id) ?? 0) : undefined}
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
                    snapPos={(x, y, node) =>
                      snapGrid
                        ? (snapToDrawnEdges(node, x, y) ?? snapToGridEdges(el, layout.settings, x, y, 1))
                        : { x: snap(x, 0.1), y: snap(y, 0.1) }
                    }
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
                  const node = e.target;
                  const id = [...nodeRefs.current.entries()].find(([, n]) => n === (node as Konva.Node))?.[0];
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
                  const patch = resizePatch(el, { sx, sy, x: nx, y: ny, rotation: r }, snapGrid);
                  if (el.kind === 'table') {
                    const l = layoutRef.current;
                    const elements = l.elements.map((x) => (x.id === id ? ({ ...x, ...patch } as Element) : x));
                    commit({ ...l, elements, guests: normalizeSeats(elements, l.guests) });
                  } else patchEl(id, patch);
                }}
              />
            </Layer>
          </Stage>
          <PickBar
            t={t}
            count={peopleSel.length}
            onUnseat={() => {
              const l = layoutRef.current;
              commit({
                ...l,
                guests: l.guests.map((g) => (peopleSel.includes(g.id) ? { ...g, tableId: null, seat: null } : g)),
              });
              setPeopleSel([]);
            }}
            onClear={() => setPeopleSel([])}
          />
          <ScaleBar t={t} scale={view.scale} />
          <MarqueeBox box={marquee} />
          <CanvasTools
            t={t}
            snapGrid={snapGrid}
            locked={layoutLocked}
            selectTool={selectTool}
            peopleTool={peopleTool}
            onFit={fit}
            onSnap={toggleSnap}
            onLock={toggleLock}
            onSelectTool={() => {
              setSelectTool(!selectTool);
              setPeopleTool(false);
            }}
            onPeopleTool={() => {
              setPeopleTool(!peopleTool);
              setSelectTool(false);
            }}
          />
        </div>

        {inHall && (
          <aside className={`side${sheetOpen ? '' : ' collapsed'}`}>
            <button className="sheet-toggle" aria-expanded={sheetOpen} onClick={() => setSheetOpen(!sheetOpen)}>
              <span>{selected ? selected.label || t('properties') : `${t('properties')} · ${t('guestsToSeat')}`}</span>
              <span className="arrow" aria-hidden>
                {sheetOpen ? '▾' : '▴'}
              </span>
            </button>

            <PropertiesCard
              t={t}
              selection={selection}
              selected={selected}
              settings={layout.settings}
              guestsAtSelected={guestsAtSelected}
              onPatch={patchEl}
              onShape={setShape}
              onSeats={changeSeats}
              onHalf={(id, half) => {
                const l = layoutRef.current;
                commit({
                  ...l,
                  elements: l.elements.map((x) =>
                    x.id === id && x.kind === 'table' ? ({ ...x, half } as Element) : x,
                  ),
                });
              }}
              onDuplicate={duplicateSelected}
              onRotate={rotateSelected}
              onRemove={removeSelected}
            />

            <section className="card">
              <h2>{t('guestsToSeat')}</h2>
              <SeatList
                t={t}
                guests={layout.guests}
                tables={tables}
                peopleTool={peopleTool}
                picked={pickedSet}
                onToggle={togglePerson}
                onEdit={(id, x, y) => setGuestEdit({ id, x, y })}
              />
            </section>

            <WarningsCard
              t={t}
              totals={totals}
              issues={issues}
              full={full}
              seated={seated}
              nameById={nameById}
              onSelect={setSelectedId}
            />

            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <p className="muted saved">{t('saved')}</p>
          </aside>
        )}
      </div>

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
