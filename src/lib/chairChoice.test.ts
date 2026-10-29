import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chairSlots, parseLayout, toWorld, type TableEl } from './layout';
import { findRoutes, pickChair, type Walk } from './route';

/**
 * Checks the "which chair does the line lead to" rule on every chair of a real hall at once.
 * Routes to all chairs are worked out a single time; then thousands of groups are run through the rule and must
 * keep to a few properties, so a bad choice shows up as a failing property, not as one screenshot.
 */
const TIE = 0.5;
const layout = parseLayout(JSON.parse(readFileSync('src/lib/fixtures/real-hall.json', 'utf8')));
const tables = layout.elements.filter((e): e is TableEl => e.kind === 'table');
const chairs = tables.flatMap((t, ti) =>
  chairSlots(t, layout.settings).map((s, seat) => ({ ...toWorld(t, s.x, s.y), ti, seat })),
);
const routes: Walk[] = findRoutes(layout, chairs);

// a small deterministic random generator, so a failure can be reproduced
let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const shuffle = <T>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** Every group worth trying: runs of neighbouring chairs on each table, plus random groups on one table and across the hall. */
function groups(): number[][] {
  const out: number[][] = [];
  const byTable = tables.map((_, ti) => chairs.map((c, i) => (c.ti === ti ? i : -1)).filter((i) => i >= 0));
  for (const ids of byTable)
    for (let size = 1; size <= 10; size++)
      for (let a = 0; a + size <= ids.length; a++) out.push(ids.slice(a, a + size));
  for (let k = 0; k < 1500; k++) {
    const ids = byTable[Math.floor(rnd() * byTable.length)];
    out.push(shuffle(ids).slice(0, 2 + Math.floor(rnd() * 9)));
  }
  for (let k = 0; k < 500; k++) out.push(shuffle(chairs.map((_, i) => i)).slice(0, 2 + Math.floor(rnd() * 9)));
  return out.filter((g) => g.every((i) => routes[i]));
}

const choose = (g: number[]) => {
  const i = pickChair(
    g.map((n) => chairs[n]),
    g.map((n) => routes[n]),
  );
  return i < 0 ? -1 : g[i];
};

describe('chair choice for groups', () => {
  const all = groups();

  it('has routes for the chairs it is tested on', () => {
    expect(chairs.length).toBeGreaterThan(500);
    expect(all.length).toBeGreaterThan(2000);
  });

  it('a single guest always gets their own chair', () => {
    for (let n = 0; n < chairs.length; n += 7) if (routes[n]) expect(choose([n])).toBe(n);
  });

  it('always leads to one of the group chairs, never a clearly longer walk than the shortest', () => {
    for (const g of all) {
      const pick = choose(g);
      expect(g).toContain(pick);
      const shortest = Math.min(...g.map((n) => routes[n]!.score));
      expect(routes[pick]!.score).toBeLessThanOrEqual(shortest + TIE + 1e-9);
    }
  });

  it('does not depend on the order the guests are listed in', () => {
    for (const g of all) {
      const want = choose(g);
      for (let k = 0; k < 2; k++) expect(choose(shuffle(g))).toBe(want);
    }
  });

  it('is not changed by adding or removing a chair that is clearly farther away', () => {
    for (const g of all) {
      if (g.length < 2) continue;
      const pick = choose(g);
      const shortest = Math.min(...g.map((n) => routes[n]!.score));
      for (const n of g) {
        if (n === pick || routes[n]!.score <= shortest + TIE) continue;
        expect(choose(g.filter((m) => m !== n))).toBe(pick);
      }
    }
  });

  it('of equally far chairs, takes the one nearest the last bend: the first chair you reach', () => {
    for (const g of all) {
      const pick = choose(g);
      const shortest = Math.min(...g.map((n) => routes[n]!.score));
      const best = g.find((n) => routes[n]!.score === shortest)!;
      const line = routes[best]!.route;
      const bend = line[Math.max(0, line.length - 3)];
      const d = (n: number) => Math.hypot(chairs[n].x - bend.x, chairs[n].y - bend.y);
      for (const n of g) if (routes[n]!.score <= shortest + TIE) expect(d(pick)).toBeLessThanOrEqual(d(n) + 1e-9);
    }
  });

  it('reports how often the tie rule changed the answer (set AUDIT_OUT to save the numbers)', () => {
    let changed = 0;
    let widest = 0;
    for (const g of all) {
      const pick = choose(g);
      const shortest = Math.min(...g.map((n) => routes[n]!.score));
      if (routes[pick]!.score > shortest + 1e-9) {
        changed++;
        widest = Math.max(widest, routes[pick]!.score - shortest);
      }
    }
    if (process.env.AUDIT_OUT)
      writeFileSync(
        process.env.AUDIT_OUT,
        `chairs ${chairs.length}, groups ${all.length}, tie rule changed ${changed} (${((100 * changed) / all.length).toFixed(1)}%), widest extra walk ${widest.toFixed(2)} m`,
      );
    expect(widest).toBeLessThanOrEqual(TIE + 1e-9);
  });
});

describe('pickChair on hand-made cases', () => {
  const walk = (score: number, bend: { x: number; y: number }, end: { x: number; y: number }): Walk => ({
    score,
    start: { x: 0, y: 0 },
    route: [{ x: 0, y: 0 }, bend, { x: end.x, y: end.y - 0.1 }, end], // the bend is the third point from the end
  });

  it('settles exactly equal walks by position, whatever order the chairs come in', () => {
    // two chairs the same walk away, but their lines bend in different places
    const a = { x: 5, y: 0 };
    const b = { x: 5, y: 3 };
    const ra = walk(10, { x: 5, y: -1 }, a); // bends right beside chair a
    const rb = walk(10, { x: 9, y: 9 }, b);
    const first = pickChair([a, b], [ra, rb]);
    const second = pickChair([b, a], [rb, ra]);
    expect([a, b][first]).toEqual([b, a][second]);
  });

  it('prefers the chair nearest the bend when walks are within the tie distance', () => {
    const near = { x: 2, y: 1 };
    const far = { x: 2, y: 4 };
    // `far` is a hair shorter to walk to, but its line bends at (2, 0), right next to `near`
    const rFar = walk(10, { x: 2, y: 0 }, far);
    const rNear = walk(10.3, { x: 2, y: 0 }, near);
    expect(pickChair([far, near], [rFar, rNear])).toBe(1);
  });

  it('keeps the clearly shorter walk when the difference is more than the tie distance', () => {
    const near = { x: 2, y: 1 };
    const far = { x: 2, y: 4 };
    expect(pickChair([far, near], [walk(10, { x: 2, y: 0 }, far), walk(11, { x: 2, y: 0 }, near)])).toBe(0);
  });

  it('returns -1 when no chair has a route', () => {
    expect(pickChair([{ x: 0, y: 0 }], [null])).toBe(-1);
  });
});
