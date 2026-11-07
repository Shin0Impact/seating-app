import { describe, expect, it } from 'vitest';
import { merge3 } from './merge';
import { emptyLayout, newGuest, newTable, type Layout } from './layout';

function plan(): Layout {
  const l = emptyLayout();
  const t1 = { ...newTable(0, 0, 'round', 4, 1), id: 't1' };
  const t2 = { ...newTable(5, 0, 'round', 4, 2), id: 't2' };
  const a = { ...newGuest('Ali', 'A', null, false), id: 'a' };
  const b = { ...newGuest('Bea', 'B', null, false), id: 'b' };
  const c = { ...newGuest('Cam', 'B', 't1', false), id: 'c', seat: 0 };
  return { ...l, elements: [t1, t2], guests: [a, b, c] };
}
const g = (l: Layout, id: string) => l.guests.find((x) => x.id === id)!;

describe('merge3', () => {
  it('keeps both sides edits to different guests and fields', () => {
    const base = plan();
    const mine = { ...base, guests: base.guests.map((x) => (x.id === 'a' ? { ...x, name: 'Ali K' } : x)) };
    const theirs = {
      ...base,
      guests: base.guests.map((x) =>
        x.id === 'a' ? { ...x, tableId: 't2', seat: 1 } : x.id === 'b' ? { ...x, group: 'C' } : x,
      ),
    };
    const m = merge3(base, mine, theirs);
    expect(g(m, 'a')).toMatchObject({ name: 'Ali K', tableId: 't2', seat: 1 });
    expect(g(m, 'b').group).toBe('C');
  });
  it('mine wins when both changed the same field; table and chair move together', () => {
    const base = plan();
    const mine = { ...base, guests: base.guests.map((x) => (x.id === 'a' ? { ...x, tableId: 't1', seat: 2 } : x)) };
    const theirs = { ...base, guests: base.guests.map((x) => (x.id === 'a' ? { ...x, tableId: 't2', seat: 3 } : x)) };
    expect(g(merge3(base, mine, theirs), 'a')).toMatchObject({ tableId: 't1', seat: 2 });
  });
  it('adds from both sides, removes from either', () => {
    const base = plan();
    const d = { ...newGuest('Dan', 'A', null, false), id: 'd' };
    const e = { ...newGuest('Eve', 'A', null, false), id: 'e' };
    const mine = { ...base, guests: [...base.guests.filter((x) => x.id !== 'b'), d] };
    const theirs = { ...base, guests: [...base.guests.filter((x) => x.id !== 'c'), e] };
    const ids = merge3(base, mine, theirs)
      .guests.map((x) => x.id)
      .sort();
    expect(ids).toEqual(['a', 'd', 'e']);
  });
  it('two guests put on the same chair: one keeps it, the other gets the next free chair at that table', () => {
    const base = plan();
    const mine = { ...base, guests: base.guests.map((x) => (x.id === 'a' ? { ...x, tableId: 't2', seat: 0 } : x)) };
    const theirs = { ...base, guests: base.guests.map((x) => (x.id === 'b' ? { ...x, tableId: 't2', seat: 0 } : x)) };
    const m = merge3(base, mine, theirs);
    expect([g(m, 'a').seat, g(m, 'b').seat].sort()).toEqual([0, 1]);
    expect(g(m, 'a').tableId).toBe('t2');
    expect(g(m, 'b').tableId).toBe('t2');
  });
  it('a guest on a table the other side removed is unseated', () => {
    const base = plan();
    const mine = { ...base, guests: base.guests.map((x) => (x.id === 'a' ? { ...x, tableId: 't2', seat: 0 } : x)) };
    const theirs = { ...base, elements: base.elements.filter((x) => x.id !== 't2') };
    expect(g(merge3(base, mine, theirs), 'a')).toMatchObject({ tableId: null, seat: null });
  });
  it('element moved on one side and resized on the other keeps both', () => {
    const base = plan();
    const mine = { ...base, elements: base.elements.map((x) => (x.id === 't1' ? { ...x, x: 3, y: 4 } : x)) };
    const theirs = { ...base, elements: base.elements.map((x) => (x.id === 't1' ? { ...x, seats: 10 } : x)) };
    expect(merge3(base, mine, theirs).elements[0]).toMatchObject({ x: 3, y: 4, seats: 10 });
  });
});
