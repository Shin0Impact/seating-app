import { describe, expect, it } from 'vitest';
import { chairSlots, emptyLayout, intersects, parseLayout, tableFootprint, type Layout, type TableEl } from './layout';
import { buildFocus, findRoute } from './route';

const hall = (guestsAt: { tableId: string; seat: number }[], entrance = true) =>
  parseLayout({
    version: 1,
    settings: { seatWidth: 0.6, chairDepth: 0.45, rectTableWidth: 0.9, walkway: 0.6 },
    elements: [
      ...(entrance ? [{ id: 'en', kind: 'marker', marker: 'entrance', w: 3, h: 0.8, x: 10, y: 16, rotation: 0, label: 'E' }] : []),
      { id: 'st', kind: 'marker', marker: 'stage', w: 8, h: 2.5, x: 10, y: 0, rotation: 0, label: 'S' },
      { id: 'df', kind: 'marker', marker: 'dancefloor', w: 6, h: 5, x: 10, y: 6.5, rotation: 0, label: 'D' },
      { id: 't1', kind: 'table', shape: 'round', seats: 8, x: 3, y: 4, rotation: 0, label: '1' },
      { id: 't2', kind: 'table', shape: 'round', seats: 8, x: 17, y: 4, rotation: 0, label: '2' },
      { id: 't3', kind: 'table', shape: 'round', seats: 8, x: 10, y: 12.5, rotation: 0, label: '3' },
    ],
    guests: guestsAt.map((g, i) => ({ id: `g${i}`, name: `G${i}`, group: '', tableId: g.tableId, seat: g.seat, stepFree: false })),
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
        for (const t of others) expect(intersects({ type: 'circle', cx: x, cy: y, r: 0.05 }, tableFootprint(t, layout.settings))).toBe(false);
      }
    }
  });

  it('cuts across the dance floor when that is the way to a table behind it', () => {
    const layout = hall([{ tableId: 't1', seat: 4 }]);
    const f = buildFocus(layout, ['g0'])!;
    expect(f.route).not.toBeNull();
    const crosses = f.route!.some((p) => p.x > 7 && p.x < 13 && p.y > 4 && p.y < 9) || f.route!.some((p, i, a) => i > 0 && p.x > 5 && a[i - 1].x < 5);
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
    const l = { ...emptyLayout(), elements: [{"id": "41147374-1548-41ed-add9-ed582e5b4be7", "kind": "marker", "x": -26.08909808039001, "y": 18.737369182997313, "rotation": 0, "label": "Entrance", "marker": "entrance", "w": 2, "h": 0.5}, {"id": "a2ce00e9-ec66-40c6-95ff-bc163a16ae26", "kind": "table", "x": 19.95239453929866, "y": 6.597527179365322, "rotation": -143.79243056092048, "label": "Table 0", "shape": "rect", "seats": 45}, {"id": "78a7affe-0752-4aea-a576-2e217f6cdfe5", "kind": "table", "x": -13.270194105649118, "y": -20.022945078985398, "rotation": 21.42669894822123, "label": "Table 1", "shape": "rect", "seats": 50}, {"id": "5a40acce-343e-4d41-bbb3-2e86bb960e70", "kind": "table", "x": -29.290602305923414, "y": 17.754418536602458, "rotation": -21.085628269048556, "label": "Table 2", "shape": "rect", "seats": 50}, {"id": "c8bce674-6e45-4d17-b4a5-7262e71a624f", "kind": "table", "x": 13.234451618693889, "y": 17.605814544415225, "rotation": -99.74908808282974, "label": "Table 3", "shape": "round", "seats": 87}, {"id": "e1e55da3-ac3f-40cb-8a88-f216ea043593", "kind": "marker", "x": 8.378662309137653, "y": -28.70523557368226, "rotation": 0, "label": "Stage", "marker": "stage", "w": 14.50520525711553, "h": 16.24199949550187}, {"id": "bbfdd4f4-7a69-4a43-8c46-27244b6fb527", "kind": "table", "x": 7.867597836358023, "y": 1.9710464610323832, "rotation": -155.7410042763628, "label": "Table 5", "shape": "round", "seats": 76}, {"id": "0b0066c2-6312-4edf-a724-13ba6dfa908e", "kind": "table", "x": -14.985987420717573, "y": 29.97751756117453, "rotation": 176.63959073395188, "label": "Table 6", "shape": "round", "seats": 1}, {"id": "7b425360-7d88-47a5-9570-884269fef0fd", "kind": "marker", "x": -10.365640869651504, "y": 11.750831117239706, "rotation": 0, "label": "Stage", "marker": "stage", "w": 21.32522409597215, "h": 1.716653812366449}] } as unknown as Layout;
    const t0 = Date.now();
    for (const c of [{ x: 0, y: 0 }, { x: 12, y: -3 }, { x: -20, y: 25 }, { x: 25, y: 10 }]) findRoute(l, c);
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});

describe('safe routes and half tables', () => {
  it('detours along a drawn walkway', () => {
    const base = hall([{ tableId: 't2', seat: 0 }]);
    const withWalk: Layout = { ...base, elements: [...base.elements, { id: 'w1', kind: 'marker', marker: 'walkway', w: 1.2, h: 14, x: 20.5, y: 9, rotation: 0, label: 'W' } as Layout['elements'][number]] };
    const plain = findRoute(base, buildFocus(base, ['g0'])!.chair!)!;
    const walked = findRoute(withWalk, buildFocus(withWalk, ['g0'])!.chair!)!;
    expect(walked.route.some((p) => Math.abs(p.x - 20.5) < 0.8)).toBe(true);
    expect(plain.route.some((p) => Math.abs(p.x - 20.5) < 0.8)).toBe(false);
  });
  it('seats a half table on one side only', () => {
    const l = parseLayout({ version: 1, settings: {}, elements: [{ id: 'h', kind: 'table', shape: 'rect', half: true, seats: 6, x: 0, y: 0, rotation: 0, label: 'H' }], guests: [] });
    const t = l.elements[0] as TableEl;
    expect(t.half).toBe(true);
    const slots = chairSlots(t, l.settings);
    expect(slots).toHaveLength(6);
    expect(slots.every((s) => s.y > 0)).toBe(true);
  });
});
