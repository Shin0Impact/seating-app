import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS as S,
  ColumnEl,
  TableEl,
  chairSlots,
  findIssues,
  firstFreeSeat,
  intersects,
  nearestChair,
  normalizeSeats,
  seatGuest,
  tableAt,
  newTable,
  newGuest,
  overfullTables,
  parseLayout,
  seatedCounts,
  tableDims,
} from './layout';

const table = (over: Partial<TableEl>): TableEl => ({ ...newTable(0, 0, 'round', 10, 1), ...over });

describe('table sizing from chair count', () => {
  it('round table diameter grows with chairs', () => {
    const d8 = tableDims({ shape: 'round', seats: 8 }, S);
    const d12 = tableDims({ shape: 'round', seats: 12 }, S);
    if (d8.shape !== 'round' || d12.shape !== 'round') throw new Error('shape');
    expect(d12.diameter).toBeGreaterThan(d8.diameter);
    // 10 chairs at 0.6 m each: circumference 6 m, diameter about 1.91 m
    const d10 = tableDims({ shape: 'round', seats: 10 }, S);
    if (d10.shape !== 'round') throw new Error('shape');
    expect(d10.diameter).toBeCloseTo(1.91, 2);
  });

  it('rectangular table seats half the chairs per long side', () => {
    const d = tableDims({ shape: 'rect', seats: 10 }, S);
    if (d.shape !== 'rect') throw new Error('shape');
    expect(d.length).toBeCloseTo(3.0, 5);
    expect(d.width).toBe(S.rectTableWidth);
  });

  it('odd chair counts round up per side', () => {
    const d = tableDims({ shape: 'rect', seats: 7 }, S);
    if (d.shape !== 'rect') throw new Error('shape');
    expect(d.length).toBeCloseTo(2.4, 5);
  });
});

describe('geometry', () => {
  it('detects circle and rotated rectangle intersections', () => {
    expect(intersects({ type: 'circle', cx: 0, cy: 0, r: 1 }, { type: 'circle', cx: 1.5, cy: 0, r: 1 })).toBe(true);
    expect(intersects({ type: 'circle', cx: 0, cy: 0, r: 1 }, { type: 'circle', cx: 3, cy: 0, r: 1 })).toBe(false);
    const rect = { type: 'rect', cx: 0, cy: 0, w: 4, h: 1, rot: 90 } as const;
    // rotated 90 degrees the rectangle is 1 wide and 4 tall
    expect(intersects(rect, { type: 'circle', cx: 0, cy: 1.8, r: 0.5 })).toBe(true);
    expect(intersects(rect, { type: 'circle', cx: 1.8, cy: 0, r: 0.5 })).toBe(false);
  });
});

describe('issue detection', () => {
  it('flags overlapping tables as overlap', () => {
    const issues = findIssues([table({ id: 'a', x: 0 }), table({ id: 'b', x: 2 })], S);
    expect(issues.map((i) => i.type)).toEqual(['overlap']);
  });

  it('flags nearly touching tables as tight, and distant ones not at all', () => {
    // footprint radius = 0.955 + 0.45 = 1.405; centers 3.0 apart leave 0.19 m free
    expect(findIssues([table({ id: 'a', x: 0 }), table({ id: 'b', x: 3 })], S)[0].type).toBe('tight');
    expect(findIssues([table({ id: 'a', x: 0 }), table({ id: 'b', x: 6 })], S)).toEqual([]);
  });

  it('flags a column inside a table footprint', () => {
    const col: ColumnEl = { id: 'c', kind: 'column', x: 1.5, y: 0, rotation: 0, label: 'Column', shape: 'circle', size: 0.5 };
    const issues = findIssues([table({ id: 'a', x: 0 }), col], S);
    expect(issues.some((i) => i.type === 'overlap' && i.b === 'c')).toBe(true);
  });
});

describe('parseLayout (untrusted input)', () => {
  const good = {
    version: 1,
    settings: {},
    elements: [{ id: 't1', kind: 'table', x: 1, y: 2, rotation: 0, label: 'T1', shape: 'round', seats: 8 }],
  };

  it('accepts a valid layout and fills defaults', () => {
    const l = parseLayout(good);
    expect(l.elements).toHaveLength(1);
    expect(l.settings.seatWidth).toBe(S.seatWidth);
  });

  it('clamps absurd values and truncates labels', () => {
    const l = parseLayout({
      ...good,
      elements: [{ ...good.elements[0], seats: 9999, x: 1e9, label: 'x'.repeat(500) }],
    });
    const t = l.elements[0] as TableEl;
    expect(t.seats).toBe(100);
    expect(t.x).toBe(500);
    expect(t.label.length).toBe(40);
  });

  it('rejects wrong versions, unknown element types and non-numbers', () => {
    expect(() => parseLayout({ ...good, version: 2 })).toThrow();
    expect(() => parseLayout({ ...good, elements: [{ kind: 'script', x: 0, y: 0 }] })).toThrow();
    expect(() => parseLayout({ ...good, elements: [{ ...good.elements[0], x: 'abc' }] })).toThrow();
    expect(() => parseLayout(null)).toThrow();
  });

  it('makes duplicate ids unique', () => {
    const l = parseLayout({ ...good, elements: [good.elements[0], good.elements[0]] });
    expect(new Set(l.elements.map((e) => e.id)).size).toBe(2);
  });
});

describe('guests', () => {
  const base = {
    version: 1,
    elements: [{ id: 't1', kind: 'table', x: 0, y: 0, rotation: 0, label: 'T1', shape: 'round', seats: 2 }],
  };

  it('loads guests, trims names and drops empty ones', () => {
    const l = parseLayout({
      ...base,
      guests: [
        { id: 'g1', name: '  Sara  ', group: 'Family', tableId: 't1' },
        { id: 'g2', name: '   ' },
      ],
    });
    expect(l.guests).toHaveLength(1);
    expect(l.guests[0].name).toBe('Sara');
    expect(l.guests[0].tableId).toBe('t1');
  });

  it('unseats guests whose table does not exist and defaults old files to no guests', () => {
    expect(parseLayout({ ...base, guests: [{ name: 'A', tableId: 'gone' }] }).guests[0].tableId).toBeNull();
    expect(parseLayout(base).guests).toEqual([]);
  });

  it('rejects a non-array guest list and caps lengths', () => {
    expect(() => parseLayout({ ...base, guests: 'x' })).toThrow();
    expect(parseLayout({ ...base, guests: [{ name: 'x'.repeat(500) }] }).guests[0].name.length).toBe(60);
  });

  it('counts seated guests and finds overfull tables', () => {
    const guests = [newGuest('A', '', 't1'), newGuest('B', '', 't1'), newGuest('C', '', 't1'), newGuest('D')];
    expect(seatedCounts(guests).get('t1')).toBe(3);
    const l = parseLayout(base);
    expect(overfullTables(l.elements, guests).map((t) => t.id)).toEqual(['t1']);
  });
});

describe('chair-level seating', () => {
  const t1 = table({ id: 't1', x: 0, y: 0, seats: 4 });
  const t2 = table({ id: 't2', x: 10, y: 0, seats: 4 });
  const els = [t1, t2];

  it('has one slot per chair, round counted clockwise from the top', () => {
    const slots = chairSlots(t1, S);
    expect(slots).toHaveLength(4);
    expect(slots[0].x).toBeCloseTo(0, 5);
    expect(slots[0].y).toBeLessThan(0); // chair 1 is at the top
    expect(slots[1].x).toBeGreaterThan(0); // chair 2 is to the right
    expect(chairSlots({ shape: 'rect', seats: 7 }, S)).toHaveLength(7);
  });

  it('finds the nearest chair in world coordinates, including rotation', () => {
    const top = chairSlots(t1, S)[0];
    expect(nearestChair(els, S, top.x, top.y)).toEqual({ tableId: 't1', seat: 0 });
    // rotate the table a quarter turn clockwise: chair 1 moves from the top to the right
    const rotated = [{ ...t1, rotation: 90 }];
    const w = { x: -top.y, y: top.x }; // (x, y) rotated by 90 degrees
    expect(nearestChair(rotated, S, w.x, w.y)).toEqual({ tableId: 't1', seat: 0 });
    expect(nearestChair(els, S, 5, 5)).toBeNull();
  });

  it('finds the table under a point and the first free chair', () => {
    expect(tableAt(els, S, 0.2, 0.2)?.id).toBe('t1');
    expect(tableAt(els, S, 5, 5)).toBeNull();
    const g1 = { ...newGuest('A', '', 't1'), seat: 0 };
    const g2 = { ...newGuest('B', '', 't1'), seat: 1 };
    expect(firstFreeSeat(t1, [g1, g2])).toBe(2);
    expect(firstFreeSeat(t1, [g1, g2], g1.id)).toBe(0);
    const full = [0, 1, 2, 3].map((i) => ({ ...newGuest('G' + i, '', 't1'), seat: i }));
    expect(firstFreeSeat(t1, full)).toBeNull();
  });

  it('moves a guest to a free chair and swaps when the chair is taken', () => {
    const a = { ...newGuest('A', '', 't1'), seat: 0 };
    const b = { ...newGuest('B', '', 't1'), seat: 1 };
    const moved = seatGuest([a, b], a.id, 't1', 3);
    expect(moved.find((g) => g.id === a.id)?.seat).toBe(3);
    const swapped = seatGuest([a, b], a.id, 't1', 1);
    expect(swapped.find((g) => g.id === a.id)?.seat).toBe(1);
    expect(swapped.find((g) => g.id === b.id)?.seat).toBe(0);
    // swapping across tables
    const c = { ...newGuest('C', '', 't2'), seat: 2 };
    const across = seatGuest([a, c], a.id, 't2', 2);
    expect(across.find((g) => g.id === c.id)).toMatchObject({ tableId: 't1', seat: 0 });
  });

  it('displaced guest is unseated when the dragged guest had no chair', () => {
    const b = { ...newGuest('B', '', 't1'), seat: 1 };
    const fresh = newGuest('N');
    const res = seatGuest([b, fresh], fresh.id, 't1', 1);
    expect(res.find((g) => g.id === fresh.id)).toMatchObject({ tableId: 't1', seat: 1 });
    expect(res.find((g) => g.id === b.id)).toMatchObject({ tableId: null, seat: null });
  });

  it('seating without a chair, and unseating', () => {
    const a = { ...newGuest('A', '', 't1'), seat: 2 };
    expect(seatGuest([a], a.id, 't1', null)[0]).toMatchObject({ tableId: 't1', seat: null });
    expect(seatGuest([a], a.id, null, null)[0]).toMatchObject({ tableId: null, seat: null });
  });

  it('normalizeSeats clears chairs that no longer exist, duplicates, and removed tables', () => {
    const small = [{ ...t1, seats: 2 }];
    const a = { ...newGuest('A', '', 't1'), seat: 3 }; // chair 4 no longer exists
    const b = { ...newGuest('B', '', 't1'), seat: 1 };
    const c = { ...newGuest('C', '', 't1'), seat: 1 }; // duplicate
    const d = { ...newGuest('D', '', 'gone'), seat: 0 }; // table removed
    const res = normalizeSeats(small, [a, b, c, d]);
    expect(res.map((g) => g.seat)).toEqual([null, 1, null, null]);
    expect(res[3].tableId).toBeNull();
  });

  it('parseLayout keeps valid chairs and clears duplicates', () => {
    const l = parseLayout({
      version: 1,
      elements: [{ id: 't1', kind: 'table', x: 0, y: 0, rotation: 0, label: 'T', shape: 'round', seats: 4 }],
      guests: [
        { name: 'A', tableId: 't1', seat: 2 },
        { name: 'B', tableId: 't1', seat: 2 },
        { name: 'C', tableId: 't1', seat: 9 },
        { name: 'D', seat: 1 },
      ],
    });
    expect(l.guests.map((g) => g.seat)).toEqual([2, null, null, null]);
  });
});

describe('snapToGridEdges', () => {
  it('puts an edge of the box on a grid line', async () => {
    const { snapToGridEdges, newZone, DEFAULT_SETTINGS } = await import('./layout');
    const z = { ...newZone(0, 0), w: 3, h: 2 };
    const p = snapToGridEdges(z, DEFAULT_SETTINGS, 5.2, 7.4, 1);
    expect(p.x - 1.5).toBeCloseTo(Math.round(p.x - 1.5));
    expect(p.y - 1).toBeCloseTo(Math.round(p.y - 1));
  });
});
