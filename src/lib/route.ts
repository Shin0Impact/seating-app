// Walking route from the entrance to a guest's chair, for the "where do I sit" map.
import {
  chairWorld,
  columnShape,
  intersects,
  tableFootprint,
  type Layout,
  type MarkerEl,
  type Shape,
  type TableEl,
} from './layout';

export type Pt = { x: number; y: number };
export type Focus = {
  /** Tables to circle on the map. */
  tableIds: string[];
  /** The chair of the first person on the invite, if they have one. */
  chair: Pt | null;
  /** Entrance to chair, in meters. Null when no entrance is marked or no way through was found. */
  route: Pt[] | null;
  start: Pt | null;
  /** Table label, e.g. "Table 4". */
  table: string;
  /** 1-based chair number as printed on the plan. */
  seat: number | null;
};

const WALK_COST = 0.2;
const BLOCKING_MARKERS = new Set(['stage', 'buffet', 'other']);

class Heap {
  private a: [number, number][] = [];
  get size() {
    return this.a.length;
  }
  push(f: number, id: number) {
    const a = this.a;
    a.push([f, id]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const box = (sh: Shape): [number, number, number, number] => {
  const h = sh.type === 'circle' ? sh.r : Math.hypot(sh.w, sh.h) / 2;
  return [sh.cx - h, sh.cy - h, sh.cx + h, sh.cy + h];
};

/** Shortest walk from the nearest entrance to the chair, around tables, columns and the stage, preferring the dance floor. */
export function findRoute(layout: Layout, chair: Pt): { route: Pt[]; start: Pt } | null {
  const { elements, settings } = layout;
  const entrances = elements.filter((e): e is MarkerEl => e.kind === 'marker' && e.marker === 'entrance');
  if (!entrances.length) return null;

  const solids: Shape[] = [];
  const floors: Shape[] = [];
  const walkways: Shape[] = [];
  for (const e of elements) {
    if (e.kind === 'table') solids.push(tableFootprint(e, settings, 0.12));
    else if (e.kind === 'column') {
      const c = columnShape(e);
      solids.push(c.type === 'circle' ? { ...c, r: c.r + 0.15 } : { ...c, w: c.w + 0.3, h: c.h + 0.3 });
    } else if (e.kind === 'marker') {
      const r: Shape = { type: 'rect', cx: e.x, cy: e.y, w: e.w, h: e.h, rot: e.rotation };
      if (BLOCKING_MARKERS.has(e.marker)) solids.push({ ...r, type: 'rect', w: e.w + 0.2, h: e.h + 0.2 } as Shape);
      else if (e.marker === 'dancefloor') floors.push(r);
      else if (e.marker === 'walkway') walkways.push(r);
    }
  }

  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const grow = (b: [number, number, number, number]) => {
    x0 = Math.min(x0, b[0]);
    y0 = Math.min(y0, b[1]);
    x1 = Math.max(x1, b[2]);
    y1 = Math.max(y1, b[3]);
  };
  for (const s of [...solids, ...floors, ...walkways]) grow(box(s));
  for (const en of entrances) grow([en.x - en.w / 2, en.y - en.h / 2, en.x + en.w / 2, en.y + en.h / 2]);
  grow([chair.x, chair.y, chair.x, chair.y]);
  const pad = 2;
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 += pad;
  let cell = 0.25;
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null;
  for (let g = 0; g < 200 && ((x1 - x0) / cell) * ((y1 - y0) / cell) > 160000; g++) cell *= 1.4;
  const cols = Math.ceil((x1 - x0) / cell),
    rows = Math.ceil((y1 - y0) / cell);

  const blocked = new Uint8Array(cols * rows);
  const cost = new Float32Array(cols * rows).fill(1);
  const centre = (i: number, j: number): Pt => ({ x: x0 + (i + 0.5) * cell, y: y0 + (j + 0.5) * cell });
  const paint = (sh: Shape, apply: (idx: number) => void) => {
    const [bx0, by0, bx1, by1] = box(sh);
    const i0 = Math.max(0, Math.floor((bx0 - x0) / cell)),
      i1 = Math.min(cols - 1, Math.floor((bx1 - x0) / cell));
    const j0 = Math.max(0, Math.floor((by0 - y0) / cell)),
      j1 = Math.min(rows - 1, Math.floor((by1 - y0) / cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const c = centre(i, j);
        if (intersects({ type: 'circle', cx: c.x, cy: c.y, r: cell * 0.5 }, sh)) apply(j * cols + i);
      }
  };
  for (const f of floors)
    paint(f, (idx) => {
      cost[idx] = 0.55;
    });
  // drawn safe routes: the guests' usual foot traffic, so the line strongly prefers them (never blocked, just cheaper)
  for (const w of walkways)
    paint(w, (idx) => {
      cost[idx] = WALK_COST;
    });
  for (const s of solids)
    paint(s, (idx) => {
      blocked[idx] = 1;
    });

  const cellOf = (p: Pt): [number, number] => [
    Math.min(cols - 1, Math.max(0, Math.floor((p.x - x0) / cell))),
    Math.min(rows - 1, Math.max(0, Math.floor((p.y - y0) / cell))),
  ];
  const nearestFree = (p: Pt): number | null => {
    const [ci, cj] = cellOf(p);
    for (let r = 0; r < 80; r++) {
      let best = -1,
        bestD = Infinity;
      for (let j = cj - r; j <= cj + r; j++)
        for (let i = ci - r; i <= ci + r; i++) {
          if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
          if (blocked[j * cols + i]) continue;
          const d = (i - ci) ** 2 + (j - cj) ** 2;
          if (d < bestD) {
            bestD = d;
            best = j * cols + i;
          }
        }
      if (best >= 0) return best;
    }
    return null;
  };

  const goal = nearestFree(chair);
  if (goal === null) return null;
  const gi = goal % cols,
    gj = Math.floor(goal / cols);

  const astar = (start: number): number[] | null => {
    // Float64: with Float32 rounding a cell could look improvable forever and the search never ended (ran out of memory)
    const dist = new Float64Array(cols * rows).fill(Infinity);
    const closed = new Uint8Array(cols * rows);
    let budget = cols * rows * 16;
    const prev = new Int32Array(cols * rows).fill(-1);
    const heap = new Heap();
    const h = (i: number, j: number) => {
      const dx = Math.abs(i - gi),
        dy = Math.abs(j - gj);
      return (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)) * (walkways.length ? WALK_COST : 0.55);
    };
    dist[start] = 0;
    heap.push(h(start % cols, Math.floor(start / cols)), start);
    while (heap.size) {
      if (--budget < 0) return null; // safety net: never spin
      const [, cur] = heap.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (cur === goal) break;
      const ci = cur % cols,
        cj = Math.floor(cur / cols);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di,
            nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
          const n = nj * cols + ni;
          if (blocked[n]) continue;
          if (di && dj && (blocked[cj * cols + ni] || blocked[nj * cols + ci])) continue; // no cutting corners
          const step = ((di && dj ? Math.SQRT2 : 1) * (cost[cur] + cost[n])) / 2;
          const nd = dist[cur] + step;
          if (nd < dist[n]) {
            dist[n] = nd;
            prev[n] = cur;
            heap.push(nd + h(ni, nj), n);
          }
        }
    }
    if (!isFinite(dist[goal])) return null;
    const out: number[] = [];
    for (let c = goal; c !== -1 && out.length <= cols * rows; c = prev[c]) out.push(c);
    return out.reverse();
  };

  const free = (a: Pt, b: Pt) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell * 0.5));
    for (let k = 0; k <= n; k++) {
      const [i, j] = cellOf({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
      if (blocked[j * cols + i]) return false;
    }
    return true;
  };

  let best: { pts: Pt[]; len: number; start: Pt } | null = null;
  for (const en of entrances) {
    const s = nearestFree({ x: en.x, y: en.y });
    if (s === null) continue;
    const cells = astar(s);
    if (!cells) continue;
    const raw = cells.map((c) => centre(c % cols, Math.floor(c / cols)));
    // pull the string tight: keep only the corners that matter (with drawn walkways only straight-run merging, so the line stays on them)
    const pts: Pt[] = [raw[0]];
    let at = 0;
    while (walkways.length && at < raw.length - 1) {
      let to = at + 1;
      while (
        to < raw.length - 1 &&
        Math.abs(
          (raw[to].x - raw[at].x) * (raw[to + 1].y - raw[at].y) - (raw[to].y - raw[at].y) * (raw[to + 1].x - raw[at].x),
        ) < 1e-9
      )
        to++;
      pts.push(raw[to]);
      at = to;
    }
    while (!walkways.length && at < raw.length - 1) {
      let to = raw.length - 1;
      while (to > at + 1 && !free(raw[at], raw[to])) to--;
      pts.push(raw[to]);
      at = to;
    }
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    if (!best || len < best.len) best = { pts, len, start: { x: en.x, y: en.y } };
  }
  if (!best) return null;
  return { route: [best.start, ...best.pts, chair], start: best.start };
}

/** What the "where do I sit" map should highlight for the people on one invite. */
export function buildFocus(layout: Layout, guestIds: string[]): Focus | null {
  const byId = new Map(layout.guests.map((g) => [g.id, g]));
  const seated = guestIds.map((id) => byId.get(id)).filter((g): g is NonNullable<typeof g> => !!g && !!g.tableId);
  if (!seated.length) return null;
  const tables = layout.elements.filter((e): e is TableEl => e.kind === 'table');
  const head = seated[0];
  const table = tables.find((t) => t.id === head.tableId);
  if (!table) return null;
  const chair = chairWorld(layout.elements, layout.settings, head);
  const target = chair ?? { x: table.x, y: table.y };
  let found: ReturnType<typeof findRoute> = null;
  try {
    found = findRoute(layout, target);
  } catch {
    /* a drawing problem must never break the page */
  }
  return {
    tableIds: [...new Set(seated.map((g) => g.tableId as string))],
    chair,
    route: found?.route ?? null,
    start: found?.start ?? null,
    table: table.label,
    seat: head.seat !== null ? head.seat + 1 : null,
  };
}
