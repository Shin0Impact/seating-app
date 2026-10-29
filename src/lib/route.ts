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
const DANCE_COST = 0.3;
/** Extra cost for each 45 degrees of turn (in cell lengths), so routes stay as straight as they can. */
const TURN_COST = 0.4;
/** Walking this close to a table, column or stage is discouraged: the line stays in the middle of the aisle. */
const CLEAR_RADIUS = 1.1;
const CLEAR_WEIGHT = 1.6;
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
  return findRoutes(layout, [chair])[0];
}

/** `score` is the exact walking distance on the grid (used to compare chairs); `route` is the tidied line for drawing. */
type Walk = { route: Pt[]; start: Pt; score: number } | null;

/** Routes to several chairs at once: the hall grid is built a single time and every search reuses it. */
export function findRoutes(layout: Layout, chairs: Pt[]): Walk[] {
  const none = () => chairs.map((): Walk => null);
  const { elements, settings } = layout;
  const entrances = elements.filter((e): e is MarkerEl => e.kind === 'marker' && e.marker === 'entrance');
  if (!entrances.length || !chairs.length) return none();

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
  for (const c of chairs) grow([c.x, c.y, c.x, c.y]);
  const pad = 2;
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 += pad;
  let cell = 0.25;
  if (![x0, y0, x1, y1].every(Number.isFinite)) return none();
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
      cost[idx] = DANCE_COST;
    });
  const costNoWalk = cost.slice();
  // drawn safe routes: the guests' usual foot traffic, so the line strongly prefers them (never blocked, just cheaper)
  for (const w of walkways)
    paint(w, (idx) => {
      cost[idx] = WALK_COST;
    });
  for (const s of solids)
    paint(s, (idx) => {
      blocked[idx] = 1;
    });

  // Distance (in meters) from every cell to the nearest obstacle, then a penalty that grows as a cell gets close to one.
  {
    const near = new Float32Array(cols * rows);
    for (let k = 0; k < near.length; k++) near[k] = blocked[k] ? 0 : Infinity;
    const D = Math.SQRT2;
    const relax = (k: number, from: number, w: number) => {
      if (near[from] + w < near[k]) near[k] = near[from] + w;
    };
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        if (i > 0) relax(k, k - 1, 1);
        if (j > 0) {
          relax(k, k - cols, 1);
          if (i > 0) relax(k, k - cols - 1, D);
          if (i < cols - 1) relax(k, k - cols + 1, D);
        }
      }
    for (let j = rows - 1; j >= 0; j--)
      for (let i = cols - 1; i >= 0; i--) {
        const k = j * cols + i;
        if (i < cols - 1) relax(k, k + 1, 1);
        if (j < rows - 1) {
          relax(k, k + cols, 1);
          if (i < cols - 1) relax(k, k + cols + 1, D);
          if (i > 0) relax(k, k + cols - 1, D);
        }
      }
    for (let k = 0; k < near.length; k++) {
      const m = near[k] * cell;
      if (m >= CLEAR_RADIUS || blocked[k]) continue;
      const pen = CLEAR_WEIGHT * ((CLEAR_RADIUS - m) / CLEAR_RADIUS) ** 2;
      cost[k] += pen;
      costNoWalk[k] += pen;
    }
  }

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

  // The search state is a cell plus the direction we arrived in, so changing direction can cost extra.
  const NONE = 8;
  const DIRS = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  /** One search from `start` that reaches every cell in `goals`; with a single goal it is a guided A* search. */
  const astar = (
    start: number,
    goals: number[],
    costs: Float32Array,
    withWalk: boolean,
  ): Map<number, number[]> | null => {
    const wanted = new Set(goals);
    const reached = new Map<number, number>();
    const gi = goals[0] % cols,
      gj = Math.floor(goals[0] / cols);
    const guided = wanted.size === 1;
    const states = cols * rows * 9;
    // Float64: with Float32 rounding a state could look improvable forever and the search never ended (ran out of memory)
    const dist = new Float64Array(states).fill(Infinity);
    const closed = new Uint8Array(states);
    let budget = states * 16;
    const prev = new Int32Array(states).fill(-1);
    const heap = new Heap();
    const h = (i: number, j: number) => {
      if (!guided) return 0;
      const dx = Math.abs(i - gi),
        dy = Math.abs(j - gj);
      return (
        (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)) *
        (withWalk && walkways.length ? WALK_COST : floors.length ? DANCE_COST : 1)
      );
    };
    const s0 = start * 9 + NONE;
    dist[s0] = 0;
    heap.push(h(start % cols, Math.floor(start / cols)), s0);
    while (heap.size) {
      if (--budget < 0) return null; // safety net: never spin
      const [, st] = heap.pop();
      if (closed[st]) continue;
      closed[st] = 1;
      const cur = Math.floor(st / 9);
      const dir = st % 9;
      if (wanted.has(cur) && !reached.has(cur)) {
        reached.set(cur, st);
        if (reached.size === wanted.size) break;
      }
      const ci = cur % cols,
        cj = Math.floor(cur / cols);
      for (let d = 0; d < 8; d++) {
        const [di, dj] = DIRS[d];
        const ni = ci + di,
          nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
        const n = nj * cols + ni;
        if (blocked[n]) continue;
        if (di && dj && (blocked[cj * cols + ni] || blocked[nj * cols + ci])) continue; // no cutting corners
        const step = ((di && dj ? Math.SQRT2 : 1) * (costs[cur] + costs[n])) / 2;
        let turn = 0;
        if (dir !== NONE && dir !== d) {
          const k = Math.abs(dir - d);
          turn = TURN_COST * Math.min(k, 8 - k);
        }
        const ns = n * 9 + d;
        const nd = dist[st] + step + turn;
        if (nd < dist[ns]) {
          dist[ns] = nd;
          prev[ns] = st;
          heap.push(nd + h(ni, nj), ns);
        }
      }
    }
    if (!reached.size) return null;
    const paths = new Map<number, number[]>();
    for (const [g, goalState] of reached) {
      const out: number[] = [];
      for (let c = goalState; c !== -1 && out.length <= cols * rows; c = prev[c]) out.push(Math.floor(c / 9));
      paths.set(g, out.reverse());
    }
    return paths;
  };

  const free = (a: Pt, b: Pt) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (cell * 0.5));
    for (let k = 0; k <= n; k++) {
      const [i, j] = cellOf({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
      if (blocked[j * cols + i]) return false;
    }
    return true;
  };

  /**
   * Keeps only the corners that matter (Douglas-Peucker): a stretch is replaced by a straight line when the line stays
   * within a small distance of the path the search found and does not touch anything. The path itself already keeps
   * to the middle of the aisles, so the simplified line does too.
   */
  const simplify = (raw: Pt[], tolerance = 0.3): Pt[] => {
    const keep = new Uint8Array(raw.length);
    keep[0] = keep[raw.length - 1] = 1;
    const stack: [number, number][] = [[0, raw.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop()!;
      if (b <= a + 1) continue;
      const dx = raw[b].x - raw[a].x,
        dy = raw[b].y - raw[a].y;
      const len = Math.hypot(dx, dy) || 1;
      let far = -1,
        farD = -1;
      for (let k = a + 1; k < b; k++) {
        const d = Math.abs((raw[k].x - raw[a].x) * dy - (raw[k].y - raw[a].y) * dx) / len;
        if (d > farD) {
          farD = d;
          far = k;
        }
      }
      if (farD <= tolerance && free(raw[a], raw[b])) continue;
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
    return raw.filter((_, k) => keep[k]);
  };
  const toPoints = (cells: number[]) => cells.map((c) => centre(c % cols, Math.floor(c / cols)));
  const lengthOf = (pts: Pt[]) => {
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    return len;
  };

  const goalOf = chairs.map((c) => nearestFree(c));
  const goals = [...new Set(goalOf.filter((g): g is number => g !== null))];
  const bestFor = new Map<number, { route: Pt[]; score: number; start: Pt }>();
  if (goals.length) {
    for (const en of entrances) {
      const s = nearestFree({ x: en.x, y: en.y });
      if (s === null) continue;
      const start = { x: en.x, y: en.y };
      // The straightest way there, ignoring drawn walkways.
      const plain = astar(s, goals, costNoWalk, false);
      if (!plain) continue;
      const walk = walkways.length ? astar(s, goals, cost, true) : null;
      goalOf.forEach((goal, n) => {
        if (goal === null) return;
        const plainCells = plain.get(goal);
        if (!plainCells) return;
        const chair = chairs[n];
        let route = dropJogs([start, ...simplify(toPoints(plainCells)), chair]);
        let cells = plainCells;
        // A drawn walkway is followed unless that makes the line far more bendy or much longer.
        const walkCells = walk?.get(goal);
        if (walkCells) {
          const walked = dropJogs([start, ...simplify(toPoints(walkCells)), chair]);
          if (walked.length <= route.length + 4 && lengthOf(walked) <= lengthOf(route) * 1.6) {
            route = walked;
            cells = walkCells;
          }
        }
        // chairs are compared on the exact grid walk plus the last step to the chair, not on the tidied line
        const end = centre(goal % cols, Math.floor(goal / cols));
        const score = lengthOf(toPoints(cells)) + Math.hypot(end.x - chair.x, end.y - chair.y);
        const cur = bestFor.get(n);
        if (!cur || score < cur.score) bestFor.set(n, { route, score, start });
      });
    }
  }
  return chairs.map((_, n): Walk => {
    const b = bestFor.get(n);
    return b ? { route: b.route, start: b.start, score: b.score } : null;
  });
}

/** Removes tiny zig-zags: a point right next to the start, or one only a few centimetres before the next turn. */
function dropJogs(route: Pt[]): Pt[] {
  const d = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const out: Pt[] = [route[0]];
  for (let i = 1; i < route.length - 1; i++) {
    if (i === 1 && d(route[0], route[1]) < 0.15) continue;
    if (d(route[i], route[i + 1]) < 0.4) continue;
    out.push(route[i]);
  }
  out.push(route[route.length - 1]);
  return out;
}

/** What the "where do I sit" map should highlight for the people on one invite. */
export function buildFocus(layout: Layout, guestIds: string[]): Focus | null {
  const byId = new Map(layout.guests.map((g) => [g.id, g]));
  const seated = guestIds.map((id) => byId.get(id)).filter((g): g is NonNullable<typeof g> => !!g && !!g.tableId);
  if (!seated.length) return null;
  const tables = layout.elements.filter((e): e is TableEl => e.kind === 'table');
  const head = seated[0];
  const headTable = tables.find((t) => t.id === head.tableId);
  if (!headTable) return null;
  // With several people on the invite, lead to whichever of their chairs is the shortest walk.
  const options = seated
    .map((g) => ({ g, chair: chairWorld(layout.elements, layout.settings, g) }))
    .filter((o): o is { g: typeof head; chair: Pt } => !!o.chair);
  const entrances = layout.elements.filter((e) => e.kind === 'marker' && e.marker === 'entrance');
  const nearEntrance = (p: Pt) => Math.min(...entrances.map((e) => Math.hypot(e.x - p.x, e.y - p.y)), Infinity);
  options.sort((a, b) => nearEntrance(a.chair) - nearEntrance(b.chair));
  let pick: { g: typeof head; chair: Pt | null } = options[0] ?? { g: head, chair: null };
  let found: ReturnType<typeof findRoute> = null;
  let bestLen = Infinity;
  const tried = options.slice(0, 12);
  let routes: ReturnType<typeof findRoutes> = [];
  try {
    routes = findRoutes(
      layout,
      tried.map((o) => o.chair),
    );
  } catch {
    /* a drawing problem must never break the page */
  }
  tried.forEach((o, n) => {
    const r = routes[n];
    if (r && r.score < bestLen) {
      bestLen = r.score;
      found = r;
      pick = o;
    }
  });
  if (!found && !options.length) {
    // no chair position known: lead to the middle of the table
    try {
      found = findRoute(layout, { x: headTable.x, y: headTable.y });
    } catch {
      /* ignore */
    }
  }
  const chair = pick.chair;
  const table = tables.find((t) => t.id === pick.g.tableId) ?? headTable;
  return {
    tableIds: [...new Set(seated.map((g) => g.tableId as string))],
    chair,
    route: found?.route ?? null,
    start: found?.start ?? null,
    table: table.label,
    seat: pick.g.seat !== null ? pick.g.seat + 1 : null,
  };
}

/**
 * SVG path through the route points with the corners rounded off. Each corner is cut back by `radius`
 * (or half the shorter neighbouring segment) and joined with a curve, so the line bends softly.
 */
export function softPath(pts: Pt[], radius = 2.5): string {
  if (pts.length < 3) return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
  const f = (n: number) => Math.round(n * 1000) / 1000;
  let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1],
      b = pts[i],
      c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y),
      l2 = Math.hypot(c.x - b.x, c.y - b.y);
    if (l1 < 1e-9 || l2 < 1e-9) continue;
    const r = Math.min(radius, l1 / 2, l2 / 2);
    const p1 = { x: b.x - ((b.x - a.x) / l1) * r, y: b.y - ((b.y - a.y) / l1) * r };
    const p2 = { x: b.x + ((c.x - b.x) / l2) * r, y: b.y + ((c.y - b.y) / l2) * r };
    d += ` L${f(p1.x)} ${f(p1.y)} Q${f(b.x)} ${f(b.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${f(last.x)} ${f(last.y)}`;
}
