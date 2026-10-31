import { describe, expect, it } from 'vitest';
import { chairsInHall, chairsNeeded, expectTotals, expected, kindOf, planned, readExpectCell, roles } from './expect';
import { parseLayout, type Guest } from './layout';

const g = (id: string, name: string, extra: Partial<Guest> = {}): Guest => ({
  id,
  name,
  group: '',
  tableId: null,
  seat: null,
  stepFree: false,
  ...extra,
});

describe('planned and expected', () => {
  it('treats an invite without a guess as all sure', () => {
    expect(planned(undefined, 4)).toEqual({ sure: 4, maybe: 0, court: 0 });
    expect(planned(g('a', 'A'), 3)).toEqual({ sure: 3, maybe: 0, court: 0 });
  });
  it('splits an invite into sure, maybe and courtesy, never more than its size', () => {
    expect(planned({ expect: { sure: 3, maybe: 3 } }, 6)).toEqual({ sure: 3, maybe: 3, court: 0 });
    expect(planned({ expect: { sure: 1, maybe: 1 } }, 5)).toEqual({ sure: 1, maybe: 1, court: 3 });
    expect(planned({ expect: { sure: 0, maybe: 0 } }, 2)).toEqual({ sure: 0, maybe: 0, court: 2 });
    expect(planned({ expect: { sure: 9, maybe: 9 } }, 4)).toEqual({ sure: 4, maybe: 0, court: 0 });
  });
  it('lets the family answer replace the guess', () => {
    const guess = { expect: { sure: 3, maybe: 3 } };
    expect(expected(guess, 6, { status: 'confirmed', confirmed_count: 4, party_size: 6 })).toMatchObject({
      sure: 4,
      maybe: 0,
      court: 0,
      answered: true,
    });
    expect(expected(guess, 6, { status: 'declined', confirmed_count: null, party_size: 6 })).toMatchObject({
      sure: 0,
      maybe: 0,
      court: 0,
    });
    expect(expected(guess, 6, { status: 'pending', confirmed_count: null, party_size: 6 })).toMatchObject({
      sure: 3,
      maybe: 3,
      answered: false,
    });
  });
  it('names the invite by its numbers', () => {
    expect(kindOf({ sure: 2, maybe: 0, court: 0 })).toBe('sure');
    expect(kindOf({ sure: 2, maybe: 1, court: 0 })).toBe('maybe');
    expect(kindOf({ sure: 0, maybe: 0, court: 3 })).toBe('court');
  });
});

describe('totals and plan roles', () => {
  const guests = [
    g('n', 'Nassar', { expect: { sure: 1, maybe: 1 } }),
    g('n1', 'Nassar +1'),
    g('n2', 'Nassar +2'),
    g('h', 'Haddad'),
    g('h1', 'Haddad +1'),
    g('k', 'Khoury', { expect: { sure: 0, maybe: 0 } }),
  ];
  it('adds up every invite, with answers from the invite rows', () => {
    expect(expectTotals(guests)).toEqual({ sure: 3, maybe: 1, court: 2 });
    const rows = [
      {
        token: 't',
        guest_id: 'h',
        party_size: 2,
        status: 'confirmed',
        confirmed_count: 1,
        checked_in_at: null,
        sent_at: null,
      },
    ];
    expect(expectTotals(guests, rows)).toEqual({ sure: 2, maybe: 1, court: 2 });
  });
  it('counts maybe chairs only when maybe people get a chair', () => {
    const t = { sure: 10, maybe: 4, court: 3 };
    expect(chairsNeeded(t, true)).toBe(14);
    expect(chairsNeeded(t, false)).toBe(10);
  });
  it('makes the named guest and the first +1s the sure ones on the plan', () => {
    const r = roles(guests);
    expect([r.get('n'), r.get('n1'), r.get('n2')]).toEqual(['sure', 'maybe', 'court']);
    expect([r.get('h'), r.get('h1')]).toEqual(['sure', 'sure']);
    expect(r.get('k')).toBe('court');
  });
  it('counts the chairs in the hall', () => {
    const l = parseLayout({
      version: 1,
      elements: [
        { id: 'a', kind: 'table', shape: 'round', seats: 10, x: 0, y: 0, rotation: 0, label: '1' },
        { id: 'b', kind: 'table', shape: 'rect', seats: 20, x: 5, y: 0, rotation: 0, label: '2' },
      ],
    });
    expect(chairsInHall(l)).toBe(30);
  });
});

describe('reading the import column', () => {
  it('reads the three words in Arabic, English and Hebrew', () => {
    expect(readExpectCell('أكيد', 4)).toEqual({ sure: 4, maybe: 0 });
    expect(readExpectCell('مؤكد', 2)).toEqual({ sure: 2, maybe: 0 });
    expect(readExpectCell('ممكن', 3)).toEqual({ sure: 0, maybe: 3 });
    expect(readExpectCell('واجب', 5)).toEqual({ sure: 0, maybe: 0 });
    expect(readExpectCell('Maybe', 2)).toEqual({ sure: 0, maybe: 2 });
    expect(readExpectCell('אולי', 2)).toEqual({ sure: 0, maybe: 2 });
  });
  it('reads numbers next to the words, in either order', () => {
    expect(readExpectCell('3 أكيد 2 ممكن', 6)).toEqual({ sure: 3, maybe: 2 });
    expect(readExpectCell('أكيد ٣، ممكن ٣', 6)).toEqual({ sure: 3, maybe: 3 });
    expect(readExpectCell('ممكن 2', 4)).toEqual({ sure: 0, maybe: 2 });
    expect(readExpectCell('2', 4)).toEqual({ sure: 2, maybe: 0 });
  });
  it('never goes above the invite size', () => {
    expect(readExpectCell('9 أكيد 9 ممكن', 4)).toEqual({ sure: 4, maybe: 0 });
  });
  it('leaves empty or unreadable cells as no guess', () => {
    expect(readExpectCell('', 3)).toBeUndefined();
    expect(readExpectCell('؟', 3)).toBeUndefined();
  });
});

describe('saving and loading', () => {
  it('keeps a valid guess and the maybe-seat option, and repairs bad values', () => {
    const l = parseLayout({
      version: 1,
      elements: [],
      guests: [
        { id: 'a', name: 'A', expect: { sure: 2, maybe: 1 } },
        { id: 'b', name: 'B', expect: { sure: -4, maybe: 'x' } },
        { id: 'c', name: 'C' },
      ],
      options: { maybeSeats: false },
    });
    expect(l.guests[0].expect).toEqual({ sure: 2, maybe: 1 });
    expect(l.guests[1].expect).toEqual({ sure: 0, maybe: 0 });
    expect(l.guests[2].expect).toBeUndefined();
    expect(l.options).toEqual({ maybeSeats: false });
    expect(parseLayout({ version: 1, elements: [] }).options).toEqual({ maybeSeats: true });
  });
});
