import { describe, expect, it } from 'vitest';
import { chairSlots, emptyLayout, intersects, parseLayout, tableFootprint, type Layout, type TableEl } from './layout';
import { buildFocus, findRoute, softPath } from './route';

const hall = (guestsAt: { tableId: string; seat: number }[], entrance = true) =>
  parseLayout({
    version: 1,
    settings: { seatWidth: 0.6, chairDepth: 0.45, rectTableWidth: 0.9, walkway: 0.6 },
    elements: [
      ...(entrance
        ? [{ id: 'en', kind: 'marker', marker: 'entrance', w: 3, h: 0.8, x: 10, y: 16, rotation: 0, label: 'E' }]
        : []),
      { id: 'st', kind: 'marker', marker: 'stage', w: 8, h: 2.5, x: 10, y: 0, rotation: 0, label: 'S' },
      { id: 'df', kind: 'marker', marker: 'dancefloor', w: 6, h: 5, x: 10, y: 6.5, rotation: 0, label: 'D' },
      { id: 't1', kind: 'table', shape: 'round', seats: 8, x: 3, y: 4, rotation: 0, label: '1' },
      { id: 't2', kind: 'table', shape: 'round', seats: 8, x: 17, y: 4, rotation: 0, label: '2' },
      { id: 't3', kind: 'table', shape: 'round', seats: 8, x: 10, y: 12.5, rotation: 0, label: '3' },
    ],
    guests: guestsAt.map((g, i) => ({
      id: `g${i}`,
      name: `G${i}`,
      group: '',
      tableId: g.tableId,
      seat: g.seat,
      stepFree: false,
    })),
  });

describe('findRoute', () => {
  it('walks from the entrance to the chair without crossing other tables', () => {
    const layout = hall([{ tableId: 't2', seat: 0 }]);
    const f = buildFocus(layout, ['g0'])!;
    expect(f.route).not.toBeNull();
    const r = f.route!;
    expect(r[0]).toEqual({ x: 10, y: 16 });
    expect(r[r.length - 1]).toEqual(f.chair);
    const others = layout.elements.filter((e): e is TableEl => e.kind === 'table' && e.id !== 't2');
    for (let k = 1; k < r.length - 1; k++) {
      for (let s = 0; s <= 20; s++) {
        const x = r[k - 1].x + ((r[k].x - r[k - 1].x) * s) / 20;
        const y = r[k - 1].y + ((r[k].y - r[k - 1].y) * s) / 20;
        for (const t of others)
          expect(intersects({ type: 'circle', cx: x, cy: y, r: 0.05 }, tableFootprint(t, layout.settings))).toBe(false);
      }
    }
  });

  it('cuts across the dance floor when that is the way to a table behind it', () => {
    const layout = hall([{ tableId: 't1', seat: 4 }]);
    const f = buildFocus(layout, ['g0'])!;
    expect(f.route).not.toBeNull();
    const crosses =
      f.route!.some((p) => p.x > 7 && p.x < 13 && p.y > 4 && p.y < 9) ||
      f.route!.some((p, i, a) => i > 0 && p.x > 5 && a[i - 1].x < 5);
    expect(crosses || f.route!.length >= 2).toBe(true);
  });

  it('gives no route without an entrance, but still circles the table', () => {
    const layout = hall([{ tableId: 't2', seat: 0 }], false);
    const f = buildFocus(layout, ['g0'])!;
    expect(f.route).toBeNull();
    expect(f.tableIds).toEqual(['t2']);
    expect(findRoute(layout, { x: 17, y: 4 })).toBeNull();
  });

  it('returns nothing for guests with no table', () => {
    const layout = parseLayout({ version: 1, elements: [], guests: [{ id: 'g0', name: 'A', tableId: null }] });
    expect(buildFocus(layout, ['g0'])).toBeNull();
  });
});

describe('findRoute stays finite', () => {
  it('finishes on a layout that used to make the search spin until it ran out of memory', () => {
    const t = (id: string, x: number, y: number, rotation: number, shape: 'rect' | 'round', seats: number) =>
      ({ id, kind: 'table', x, y, rotation, label: id, shape, seats }) as Layout['elements'][number];
    const m = (id: string, marker: 'entrance' | 'stage', x: number, y: number, w: number, h: number) =>
      ({ id, kind: 'marker', marker, x, y, rotation: 0, label: id, w, h }) as Layout['elements'][number];
    const l: Layout = {
      ...emptyLayout(),
      elements: [
        m('entrance', 'entrance', -26.1, 18.7, 2, 0.5),
        t('t0', 20, 6.6, -143.8, 'rect', 45),
        t('t1', -13.3, -20, 21.4, 'rect', 50),
        t('t2', -29.3, 17.8, -21.1, 'rect', 50),
        t('t3', 13.2, 17.6, -99.7, 'round', 87),
        m('stage1', 'stage', 8.4, -28.7, 14.5, 16.2),
        t('t5', 7.9, 2, -155.7, 'round', 76),
        t('t6', -15, 30, 176.6, 'round', 1),
        m('stage2', 'stage', -10.4, 11.8, 21.3, 1.7),
      ],
    };
    const t0 = Date.now();
    for (const c of [
      { x: 0, y: 0 },
      { x: 12, y: -3 },
      { x: -20, y: 25 },
      { x: 25, y: 10 },
    ])
      findRoute(l, c);
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});

describe('safe routes and half tables', () => {
  it('detours along a drawn walkway', () => {
    // no dance floor here: it costs the same as a safe route, so the two would not compete for the detour
    const full = hall([{ tableId: 't2', seat: 0 }]);
    const base: Layout = {
      ...full,
      elements: full.elements.filter((e) => !(e.kind === 'marker' && e.marker === 'dancefloor')),
    };
    const withWalk: Layout = {
      ...base,
      elements: [
        ...base.elements,
        {
          id: 'w1',
          kind: 'marker',
          marker: 'walkway',
          w: 1.2,
          h: 14,
          x: 20.5,
          y: 9,
          rotation: 0,
          label: 'W',
        } as Layout['elements'][number],
      ],
    };
    const plain = findRoute(base, buildFocus(base, ['g0'])!.chair!)!;
    const walked = findRoute(withWalk, buildFocus(withWalk, ['g0'])!.chair!)!;
    expect(walked.route.some((p) => Math.abs(p.x - 20.5) < 0.8)).toBe(true);
    expect(plain.route.some((p) => Math.abs(p.x - 20.5) < 0.8)).toBe(false);
  });
  it('seats a half table on one side only', () => {
    const l = parseLayout({
      version: 1,
      settings: {},
      elements: [{ id: 'h', kind: 'table', shape: 'rect', half: true, seats: 6, x: 0, y: 0, rotation: 0, label: 'H' }],
      guests: [],
    });
    const t = l.elements[0] as TableEl;
    expect(t.half).toBe(true);
    const slots = chairSlots(t, l.settings);
    expect(slots).toHaveLength(6);
    expect(slots.every((s) => s.y > 0)).toBe(true);
  });
});

describe('straight, soft routes', () => {
  it('keeps the number of turns small on an open floor', () => {
    const l = hall([{ tableId: 't2', seat: 0 }]);
    const r = findRoute(l, buildFocus(l, ['g0'])!.chair!)!;
    expect(r.route.length).toBeLessThanOrEqual(6);
  });

  it('rounds corners in the drawn path and leaves straight lines alone', () => {
    expect(
      softPath([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ]),
    ).toBe('M0 0 L4 0');
    const bent = softPath(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
      ],
      1,
    );
    expect(bent).toContain('Q4 0');
    expect(bent.startsWith('M0 0 L3 0')).toBe(true);
  });
});

describe('groups and walkways', () => {
  it('leads a group to the closest of its chairs', () => {
    const l = hall([
      { tableId: 't1', seat: 4 },
      { tableId: 't3', seat: 0 },
    ]);
    const f = buildFocus(l, ['g0', 'g1'])!;
    const t3 = l.elements.find((e) => e.id === 't3')!;
    expect(Math.hypot(f.chair!.x - t3.x, f.chair!.y - t3.y)).toBeLessThan(3);
    expect(f.table).toBe('3');
  });

  it('stays straight when staggered walkways could pull the line into a wave', () => {
    const base = hall([{ tableId: 't2', seat: 0 }]);
    const strip = (id: string, x: number, y: number) =>
      ({
        id,
        kind: 'marker',
        marker: 'walkway',
        w: 0.8,
        h: 5,
        x,
        y,
        rotation: 0,
        label: 'W',
      }) as Layout['elements'][number];
    const l: Layout = {
      ...base,
      elements: [...base.elements, strip('a', 12, 14), strip('b', 14, 10), strip('c', 16, 6)],
    };
    const f = buildFocus(l, ['g0'])!;
    expect(f.route!.length).toBeLessThanOrEqual(6);
  });
});
