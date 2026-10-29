// Hall layout model. All distances are in meters; positions are element centers.
// Rotation is in degrees, clockwise (the same direction the canvas uses).

export type Settings = {
  /** Table edge used per chair, in meters. */
  seatWidth: number;
  /** How far chairs stick out from the table edge, in meters. */
  chairDepth: number;
  /** Width of rectangular tables, in meters. */
  rectTableWidth: number;
  /** Minimum free walking space between two seating areas, in meters. */
  walkway: number;
};

export const DEFAULT_SETTINGS: Settings = {
  seatWidth: 0.6,
  chairDepth: 0.45,
  rectTableWidth: 0.9,
  walkway: 0.6,
};

type Base = { id: string; x: number; y: number; rotation: number; label: string };

export type TableEl = Base & { kind: 'table'; shape: 'round' | 'rect'; seats: number; /** rectangular only: chairs on one side */ half?: boolean };
export type ColumnEl = Base & { kind: 'column'; shape: 'circle' | 'square'; size: number };
export type ZoneEl = Base & { kind: 'zone'; w: number; h: number; steps: number };
export type MarkerKind = 'stage' | 'dancefloor' | 'entrance' | 'buffet' | 'other' | 'walkway' | 'exit';
export type MarkerEl = Base & { kind: 'marker'; marker: MarkerKind; w: number; h: number };

export type Element = TableEl | ColumnEl | ZoneEl | MarkerEl;

export type Guest = {
  id: string;
  name: string;
  group: string;
  /** Id of the table the guest is seated at, or null while unseated. */
  tableId: string | null;
  /** Chair at the table, counted from 0 (see chairSlots), or null for "somewhere at the table". */
  seat: number | null;
  /** Needs step-free access (stays on the lower level). */
  stepFree: boolean;
};

export type Layout = { version: 1; settings: Settings; elements: Element[]; guests: Guest[] };

export const MARKER_KINDS: MarkerKind[] = ['stage', 'dancefloor', 'entrance', 'buffet', 'other', 'walkway', 'exit'];
export const MARKER_NAMES: Record<MarkerKind, string> = {
  stage: 'Stage',
  dancefloor: 'Dance floor',
  entrance: 'Entrance',
  buffet: 'Buffet',
  other: 'Other',
  walkway: 'Safe route',
  exit: 'Emergency exit',
};

export const LIMITS = {
  seatsMin: 1,
  seatsMax: 100,
  sizeMin: 0.1,
  sizeMax: 30,
  coordMax: 500,
  maxElements: 600,
  labelMax: 40,
  maxGuests: 2000,
  nameMax: 60,
  groupMax: 40,
};

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function emptyLayout(): Layout {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, elements: [], guests: [] };
}


export type TableDims =
  | { shape: 'round'; diameter: number }
  | { shape: 'rect'; length: number; width: number };

/** Table size follows from the number of chairs entered. */
export function tableDims(t: Pick<TableEl, 'shape' | 'seats' | 'half'>, s: Settings): TableDims {
  if (t.shape === 'round') {
    const diameter = Math.max(0.9, (t.seats * s.seatWidth) / Math.PI);
    return { shape: 'round', diameter };
  }
  const perSide = t.half ? t.seats : Math.ceil(t.seats / 2);
  return { shape: 'rect', length: Math.max(1.2, perSide * s.seatWidth), width: s.rectTableWidth };
}


type Circle = { type: 'circle'; cx: number; cy: number; r: number };
type Rect = { type: 'rect'; cx: number; cy: number; w: number; h: number; rot: number };
export type Shape = Circle | Rect;

const rad = (deg: number) => (deg * Math.PI) / 180;

/** Area a table occupies including its chairs, grown by `extra` meters on every side. */
export function tableFootprint(t: TableEl, s: Settings, extra = 0): Shape {
  const d = tableDims(t, s);
  if (d.shape === 'round') {
    return { type: 'circle', cx: t.x, cy: t.y, r: d.diameter / 2 + s.chairDepth + extra };
  }
  return {
    type: 'rect',
    cx: t.x,
    cy: t.y,
    w: d.length + 2 * extra,
    h: d.width + 2 * s.chairDepth + 2 * extra,
    rot: t.rotation,
  };
}

export function columnShape(c: ColumnEl): Shape {
  if (c.shape === 'circle') return { type: 'circle', cx: c.x, cy: c.y, r: c.size / 2 };
  return { type: 'rect', cx: c.x, cy: c.y, w: c.size, h: c.size, rot: c.rotation };
}

function corners(r: Rect): [number, number][] {
  const a = rad(r.rot);
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const hw = r.w / 2;
  const hh = r.h / 2;
  return ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as [number, number][]).map(([x, y]) => [
    r.cx + x * cos - y * sin,
    r.cy + x * sin + y * cos,
  ]);
}

function project(pts: [number, number][], ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of pts) {
    const p = x * ax + y * ay;
    if (p < min) min = p;
    if (p > max) max = p;
  }
  return [min, max];
}

function rectRect(a: Rect, b: Rect): boolean {
  const pa = corners(a);
  const pb = corners(b);
  const axes: [number, number][] = [];
  for (const r of [a, b]) {
    const t = rad(r.rot);
    axes.push([Math.cos(t), Math.sin(t)], [-Math.sin(t), Math.cos(t)]);
  }
  for (const [ax, ay] of axes) {
    const [minA, maxA] = project(pa, ax, ay);
    const [minB, maxB] = project(pb, ax, ay);
    if (maxA <= minB || maxB <= minA) return false;
  }
  return true;
}

function circleRect(c: Circle, r: Rect): boolean {
  const t = -rad(r.rot);
  const dx = c.cx - r.cx;
  const dy = c.cy - r.cy;
  const lx = dx * Math.cos(t) - dy * Math.sin(t);
  const ly = dx * Math.sin(t) + dy * Math.cos(t);
  const nx = Math.max(-r.w / 2, Math.min(r.w / 2, lx));
  const ny = Math.max(-r.h / 2, Math.min(r.h / 2, ly));
  const ddx = lx - nx;
  const ddy = ly - ny;
  return ddx * ddx + ddy * ddy < c.r * c.r;
}

export function intersects(a: Shape, b: Shape): boolean {
  if (a.type === 'circle' && b.type === 'circle') {
    const d = Math.hypot(a.cx - b.cx, a.cy - b.cy);
    return d < a.r + b.r;
  }
  if (a.type === 'circle' && b.type === 'rect') return circleRect(a, b);
  if (a.type === 'rect' && b.type === 'circle') return circleRect(b, a);
  return rectRect(a as Rect, b as Rect);
}


export type Issue = {
  type: 'overlap' | 'tight';
  a: string;
  b: string;
};

/**
 * Finds tables (with chairs) that collide with other tables or columns, and
 * pairs that leave less than the walkway width between them.
 */
export function findIssues(elements: Element[], s: Settings): Issue[] {
  const issues: Issue[] = [];
  const tables = elements.filter((e): e is TableEl => e.kind === 'table');
  const columns = elements.filter((e): e is ColumnEl => e.kind === 'column');

  for (let i = 0; i < tables.length; i++) {
    for (let j = i + 1; j < tables.length; j++) {
      const a = tables[i];
      const b = tables[j];
      if (intersects(tableFootprint(a, s), tableFootprint(b, s))) {
        issues.push({ type: 'overlap', a: a.id, b: b.id });
      } else if (intersects(tableFootprint(a, s, s.walkway / 2), tableFootprint(b, s, s.walkway / 2))) {
        issues.push({ type: 'tight', a: a.id, b: b.id });
      }
    }
    for (const c of columns) {
      const t = tables[i];
      if (intersects(tableFootprint(t, s), columnShape(c))) {
        issues.push({ type: 'overlap', a: t.id, b: c.id });
      } else if (intersects(tableFootprint(t, s, s.walkway / 2), columnShape(c))) {
        issues.push({ type: 'tight', a: t.id, b: c.id });
      }
    }
  }
  return issues;
}

export function summarize(elements: Element[]) {
  const tables = elements.filter((e): e is TableEl => e.kind === 'table');
  return { tables: tables.length, seats: tables.reduce((n, t) => n + t.seats, 0) };
}


export function newGuest(
  name: string,
  group = '',
  tableId: string | null = null,
  stepFree = false,
  seat: number | null = null,
): Guest {
  return {
    id: uid(),
    name: name.trim().slice(0, LIMITS.nameMax),
    group: group.trim().slice(0, LIMITS.groupMax),
    tableId,
    seat: tableId ? seat : null,
    stepFree,
  };
}


export type ChairSlot = { x: number; y: number; /** degrees, facing the table */ rot: number };

/**
 * Chair positions in table-local meters, in seat order. Round tables count clockwise
 * from the top; rectangular tables count left to right along the top, then along the bottom.
 */
export function chairSlots(t: Pick<TableEl, 'shape' | 'seats' | 'half'>, s: Settings): ChairSlot[] {
  const d = tableDims(t, s);
  const out: ChairSlot[] = [];
  if (d.shape === 'round') {
    const r = d.diameter / 2 + s.chairDepth / 2;
    for (let i = 0; i < t.seats; i++) {
      const a = (2 * Math.PI * i) / t.seats - Math.PI / 2;
      out.push({ x: r * Math.cos(a), y: r * Math.sin(a), rot: (a * 180) / Math.PI + 90 });
    }
    return out;
  }
  const top = t.half ? 0 : Math.ceil(t.seats / 2);
  const bottom = t.seats - top;
  const y = d.width / 2 + s.chairDepth / 2;
  for (let i = 0; i < top; i++) out.push({ x: -d.length / 2 + (d.length * (i + 0.5)) / top, y: -y, rot: 0 });
  for (let i = 0; i < bottom; i++) out.push({ x: -d.length / 2 + (d.length * (i + 0.5)) / bottom, y, rot: 0 });
  return out;
}

/** World position of a table-local point. */
export function toWorld(t: Pick<TableEl, 'x' | 'y' | 'rotation'>, lx: number, ly: number): { x: number; y: number } {
  const a = rad(t.rotation);
  return { x: t.x + lx * Math.cos(a) - ly * Math.sin(a), y: t.y + lx * Math.sin(a) + ly * Math.cos(a) };
}

/** The chair closest to a world point, if one is within maxDist meters. */
export function nearestChair(
  elements: Element[],
  s: Settings,
  x: number,
  y: number,
  maxDist = 0.6,
): { tableId: string; seat: number } | null {
  let best: { tableId: string; seat: number } | null = null;
  let bestD = maxDist;
  for (const e of elements) {
    if (e.kind !== 'table') continue;
    chairSlots(e, s).forEach((c, seat) => {
      const w = toWorld(e, c.x, c.y);
      const dist = Math.hypot(w.x - x, w.y - y);
      if (dist <= bestD) {
        bestD = dist;
        best = { tableId: e.id, seat };
      }
    });
  }
  return best;
}

/** The table whose footprint (table plus chairs) contains a world point. */
export function tableAt(elements: Element[], s: Settings, x: number, y: number): TableEl | null {
  const probe: Shape = { type: 'circle', cx: x, cy: y, r: 0.01 };
  for (const e of elements) {
    if (e.kind === 'table' && intersects(tableFootprint(e, s), probe)) return e;
  }
  return null;
}

/** Lowest-numbered chair at the table that nobody is using, or null when the table is full. */
export function firstFreeSeat(t: Pick<TableEl, 'id' | 'seats'>, guests: Guest[], ignoreId?: string): number | null {
  const taken = new Set(guests.filter((g) => g.tableId === t.id && g.id !== ignoreId && g.seat !== null).map((g) => g.seat));
  for (let i = 0; i < t.seats; i++) if (!taken.has(i)) return i;
  return null;
}

/**
 * Seats a guest at a table, optionally at a specific chair. If that chair is taken the two
 * guests swap: the other guest takes the chair this guest just left (or ends up at the same
 * table without a chair, or unseated, when there was no chair to swap into).
 */
export function seatGuest(guests: Guest[], guestId: string, tableId: string | null, seat: number | null): Guest[] {
  const me = guests.find((g) => g.id === guestId);
  if (!me) return guests;
  if (tableId === null) return guests.map((g) => (g.id === guestId ? { ...g, tableId: null, seat: null } : g));
  if (seat === null) return guests.map((g) => (g.id === guestId ? { ...g, tableId, seat: null } : g));
  const other = guests.find((g) => g.id !== guestId && g.tableId === tableId && g.seat === seat);
  return guests.map((g) => {
    if (g.id === guestId) return { ...g, tableId, seat };
    if (other && g.id === other.id) {
      if (me.tableId && me.seat !== null) return { ...g, tableId: me.tableId, seat: me.seat };
      return { ...g, tableId: me.tableId, seat: null };
    }
    return g;
  });
}

/** Drops chair numbers that no longer exist or are used twice, and unseats guests of removed tables. */
export function normalizeSeats(elements: Element[], guests: Guest[]): Guest[] {
  const tables = new Map(elements.filter((e): e is TableEl => e.kind === 'table').map((e) => [e.id, e]));
  const used = new Set<string>();
  return guests.map((g) => {
    const tb = g.tableId ? tables.get(g.tableId) : undefined;
    if (!tb) return g.tableId === null && g.seat === null ? g : { ...g, tableId: null, seat: null };
    const ok = g.seat !== null && Number.isInteger(g.seat) && g.seat >= 0 && g.seat < tb.seats && !used.has(`${tb.id}:${g.seat}`);
    if (ok) used.add(`${tb.id}:${g.seat}`);
    return ok || g.seat === null ? g : { ...g, seat: null };
  });
}

/** Number of guests seated at each table. */
export function seatedCounts(guests: Guest[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const g of guests) if (g.tableId) m.set(g.tableId, (m.get(g.tableId) ?? 0) + 1);
  return m;
}

/** Tables that have more guests than chairs. */
export function overfullTables(elements: Element[], guests: Guest[]): TableEl[] {
  const counts = seatedCounts(guests);
  return elements.filter((e): e is TableEl => e.kind === 'table' && (counts.get(e.id) ?? 0) > e.seats);
}


const num = (v: unknown, min: number, max: number, fallback?: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    if (fallback !== undefined) return fallback;
    throw new Error('Invalid number in layout file');
  }
  return Math.min(max, Math.max(min, v));
};

const text = (v: unknown, max: number = LIMITS.labelMax): string => (typeof v === 'string' ? v.slice(0, max) : '');

/** Validates untrusted JSON (an uploaded file or saved data) and returns a clean layout. */
export function parseLayout(raw: unknown): Layout {
  if (!raw || typeof raw !== 'object') throw new Error('Not a layout file');
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) throw new Error('Unsupported layout version');
  if (!Array.isArray(r.elements)) throw new Error('Layout has no elements');
  if (r.elements.length > LIMITS.maxElements) throw new Error('Layout has too many elements');

  const sIn = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Record<string, unknown>;
  const settings: Settings = {
    seatWidth: num(sIn.seatWidth, 0.3, 1.5, DEFAULT_SETTINGS.seatWidth),
    chairDepth: num(sIn.chairDepth, 0, 1.5, DEFAULT_SETTINGS.chairDepth),
    rectTableWidth: num(sIn.rectTableWidth, 0.3, 3, DEFAULT_SETTINGS.rectTableWidth),
    walkway: num(sIn.walkway, 0, 3, DEFAULT_SETTINGS.walkway),
  };

  const seen = new Set<string>();
  const elements: Element[] = r.elements.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid element in layout file');
    const e = item as Record<string, unknown>;
    let id = typeof e.id === 'string' && e.id.length > 0 && e.id.length <= 64 ? e.id : uid();
    if (seen.has(id)) id = uid();
    seen.add(id);
    const base = {
      id,
      x: num(e.x, -LIMITS.coordMax, LIMITS.coordMax),
      y: num(e.y, -LIMITS.coordMax, LIMITS.coordMax),
      rotation: num(e.rotation, -360, 360, 0),
      label: text(e.label),
    };
    switch (e.kind) {
      case 'table':
        return {
          ...base,
          kind: 'table',
          shape: e.shape === 'rect' ? 'rect' : 'round',
          seats: Math.round(num(e.seats, LIMITS.seatsMin, LIMITS.seatsMax)),
          ...(e.shape === 'rect' && e.half === true ? { half: true } : {}),
        } as TableEl;
      case 'column':
        return {
          ...base,
          kind: 'column',
          shape: e.shape === 'square' ? 'square' : 'circle',
          size: num(e.size, LIMITS.sizeMin, LIMITS.sizeMax),
        } as ColumnEl;
      case 'zone':
        return {
          ...base,
          kind: 'zone',
          w: num(e.w, LIMITS.sizeMin, LIMITS.sizeMax),
          h: num(e.h, LIMITS.sizeMin, LIMITS.sizeMax),
          steps: Math.round(num(e.steps, 0, 50, 0)),
        } as ZoneEl;
      case 'marker':
        return {
          ...base,
          kind: 'marker',
          marker: MARKER_KINDS.includes(e.marker as MarkerKind) ? (e.marker as MarkerKind) : 'other',
          w: num(e.w, LIMITS.sizeMin, LIMITS.sizeMax),
          h: num(e.h, LIMITS.sizeMin, LIMITS.sizeMax),
        } as MarkerEl;
      default:
        throw new Error('Unknown element type in layout file');
    }
  });

  const tableIds = new Set(elements.filter((e) => e.kind === 'table').map((e) => e.id));
  const gIn = r.guests === undefined ? [] : r.guests;
  if (!Array.isArray(gIn)) throw new Error('Invalid guest list');
  if (gIn.length > LIMITS.maxGuests) throw new Error('Too many guests');
  const gSeen = new Set<string>();
  const guests: Guest[] = [];
  for (const item of gIn) {
    if (!item || typeof item !== 'object') throw new Error('Invalid guest in file');
    const g = item as Record<string, unknown>;
    const name = text(g.name, LIMITS.nameMax).trim();
    if (!name) continue;
    let id = typeof g.id === 'string' && g.id.length > 0 && g.id.length <= 64 ? g.id : uid();
    if (gSeen.has(id)) id = uid();
    gSeen.add(id);
    guests.push({
      id,
      name,
      group: text(g.group, LIMITS.groupMax).trim(),
      tableId: typeof g.tableId === 'string' && tableIds.has(g.tableId) ? g.tableId : null,
      seat: typeof g.seat === 'number' && Number.isInteger(g.seat) ? g.seat : null,
      stepFree: g.stepFree === true,
    });
  }

  return { version: 1, settings, elements, guests: normalizeSeats(elements, guests) };
}


export function newTable(x: number, y: number, shape: 'round' | 'rect', seats: number, n: number): TableEl {
  return { id: uid(), kind: 'table', x, y, rotation: 0, label: `Table ${n}`, shape, seats };
}
export function newColumn(x: number, y: number, shape: 'circle' | 'square', size = 0.5): ColumnEl {
  return { id: uid(), kind: 'column', x, y, rotation: 0, label: 'Column', shape, size };
}
export function newZone(x: number, y: number): ZoneEl {
  return { id: uid(), kind: 'zone', x, y, rotation: 0, label: 'Raised area', w: 6, h: 4, steps: 3 };
}
export function newMarker(x: number, y: number, marker: MarkerKind): MarkerEl {
  const size: Record<MarkerKind, [number, number]> = {
    stage: [5, 2.5],
    dancefloor: [5, 5],
    entrance: [2, 0.5],
    buffet: [4, 1],
    other: [2, 2],
    walkway: [8, 1.2],
    exit: [1.6, 0.4],
  };
  const [w, h] = size[marker];
  return { id: uid(), kind: 'marker', x, y, rotation: 0, label: MARKER_NAMES[marker], marker, w, h };
}

export const snap = (v: number, step = 0.1) => Math.round(v / step) * step;

/** Puts new tables in rows (five across) below everything already in the hall. */
export function placeNewTables(elements: Element[], settings: Settings, fresh: TableEl[]): TableEl[] {
  const GAP = 1.2;
  let top = 0;
  for (const e of elements) {
    const bottom = e.kind === 'table' ? e.y + (tableFootprint(e, settings).type === 'circle' ? (tableFootprint(e, settings) as { r: number }).r : (tableFootprint(e, settings) as { h: number }).h / 2) : e.y + 3;
    top = Math.max(top, bottom);
  }
  const ordered = [...fresh].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const out: TableEl[] = [];
  let x = 0;
  let y = elements.length ? top + GAP : 0;
  let rowH = 0;
  ordered.forEach((tb, i) => {
    const f = tableFootprint(tb, settings);
    const w = f.type === 'circle' ? f.r * 2 : f.w;
    const h = f.type === 'circle' ? f.r * 2 : f.h;
    if (i > 0 && i % 5 === 0) {
      x = 0;
      y += rowH + GAP;
      rowH = 0;
    }
    out.push({ ...tb, x: snap(x + w / 2), y: snap(y + h / 2) });
    x += w + GAP;
    rowH = Math.max(rowH, h);
  });
  return out;
}

/**
 * Seats several guests at one table, filling free chairs in order (starting at `startSeat` when it is
 * free). Guests that do not fit stay exactly where they were.
 */
export function seatMany(
  elements: Element[],
  settings: Settings,
  guests: Guest[],
  ids: string[],
  tableId: string,
  startSeat: number | null = null,
): { guests: Guest[]; placed: number; left: number } {
  const table = elements.find((e): e is TableEl => e.kind === 'table' && e.id === tableId);
  const moving = new Set(ids);
  if (!table) return { guests, placed: 0, left: ids.length };
  const taken = new Set(guests.filter((g) => !moving.has(g.id) && g.tableId === tableId && g.seat !== null).map((g) => g.seat as number));
  const order: number[] = [];
  const from = startSeat !== null && startSeat >= 0 && startSeat < table.seats ? startSeat : 0;
  for (let k = 0; k < table.seats; k++) order.push((from + k) % table.seats);
  const free = order.filter((i) => !taken.has(i));
  const assign = new Map<string, number>();
  ids.forEach((id, k) => {
    if (k < free.length && guests.some((g) => g.id === id)) assign.set(id, free[k]);
  });
  return {
    guests: guests.map((g) => (assign.has(g.id) ? { ...g, tableId, seat: assign.get(g.id)! } : g)),
    placed: assign.size,
    left: ids.length - assign.size,
  };
}

/** World position of a guest's chair, or null when the guest has no chair. */
export function chairWorld(elements: Element[], settings: Settings, g: Guest): { x: number; y: number } | null {
  if (!g.tableId || g.seat === null) return null;
  const t = elements.find((e): e is TableEl => e.kind === 'table' && e.id === g.tableId);
  const slot = t ? chairSlots(t, settings)[g.seat] : undefined;
  return t && slot ? toWorld(t, slot.x, slot.y) : null;
}

/** Half the width/height of the box an element occupies on screen (chairs included), ignoring nothing that rotates. */
export function halfExtent(el: Element, s: Settings): { hx: number; hy: number } {
  let w: number, h: number;
  if (el.kind === 'table') {
    const f = tableFootprint(el, s);
    if (f.type === 'circle') return { hx: f.r, hy: f.r };
    w = f.w;
    h = f.h;
  } else if (el.kind === 'column') {
    if (el.shape === 'circle') return { hx: el.size / 2, hy: el.size / 2 };
    w = el.size;
    h = el.size;
  } else {
    w = el.w;
    h = el.h;
  }
  const a = (el.rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(a));
  const sn = Math.abs(Math.sin(a));
  return { hx: (c * w + sn * h) / 2, hy: (sn * w + c * h) / 2 };
}

/** Moves the element so its left and bottom edges lie on grid lines (always the same two edges, so it never flips between sides). */
export function snapToGridEdges(el: Element, s: Settings, x: number, y: number, step = 1): { x: number; y: number } {
  const { hx, hy } = halfExtent(el, s);
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { x: r(snap(x - hx, step) + hx), y: r(snap(y + hy, step) - hy) };
}
