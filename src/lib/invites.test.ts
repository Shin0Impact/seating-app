import { describe, expect, it } from 'vitest';
import { formatRanges, inviteDrafts, isToken, locate, makeToken, seatRanges } from './invites';
import { emptyLayout, newGuest, newTable } from './layout';

describe('tokens', () => {
  it('are url-safe, long and unique', () => {
    const a = makeToken(), b = makeToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(b);
    expect(isToken(a)).toBe(true);
    expect(isToken('short')).toBe(false);
    expect(isToken("x'; drop table invites;--xxxxxxxx")).toBe(false);
    expect(isToken(undefined)).toBe(false);
  });
});

describe('inviteDrafts', () => {
  it('folds "Name +1" into the named guest and keeps strays', () => {
    const a = newGuest('Fadi', 'Family', null, false, null);
    const a1 = newGuest('Fadi +1', 'Family', null, false, null);
    const a2 = newGuest('Fadi +2', 'Family', null, false, null);
    const b = newGuest('Rami', 'Work', null, false, null);
    const stray = newGuest('Nobody +1', 'Work', null, false, null);
    const d = inviteDrafts([a, a1, a2, b, stray]);
    expect(d).toHaveLength(3);
    expect(d[0]).toEqual({ guestId: a.id, memberIds: [a1.id, a2.id], partySize: 3 });
    expect(d[1]).toEqual({ guestId: b.id, memberIds: [], partySize: 1 });
    expect(d[2].guestId).toBe(stray.id);
  });
  it('accepts "Name+1" written without a space', () => {
    const a = newGuest('Fadi', 'F', null, false, null);
    const a1 = newGuest('Fadi+1', 'F', null, false, null);
    const d = inviteDrafts([a, a1]);
    expect(d).toEqual([{ guestId: a.id, memberIds: [a1.id], partySize: 2 }]);
  });
  it('does not merge people with the same name in different groups', () => {
    const a = newGuest('Sami', 'A', null, false, null);
    const b = newGuest('Sami +1', 'B', null, false, null);
    expect(inviteDrafts([a, b])).toHaveLength(2);
  });
});

describe('locate', () => {
  it('returns table label and 1-based chair', () => {
    const l = emptyLayout();
    const t = newTable(0, 0, 'rect', 10, 7);
    t.label = 'Table 7';
    l.elements = [t];
    const g = newGuest('A', '', t.id, false, 3);
    const u = newGuest('B', '', null, false, null);
    l.guests = [g, u];
    expect(locate(l, [g.id, u.id, 'missing'])).toEqual([
      { name: 'A', table: 'Table 7', seat: 4, tableId: t.id },
      { name: 'B', table: null, seat: null, tableId: null },
    ]);
  });
});

describe('seat ranges', () => {
  it('merges runs and words them', () => {
    expect(seatRanges([8, 1, 2, 3, 4, 5, 6, 7])).toEqual([[1, 8]]);
    expect(formatRanges(seatRanges([1, 2, 3, 4, 5, 6, 7, 8]), 'and')).toBe('1-8');
    expect(formatRanges(seatRanges([5, 6, 7, 11, 12, 13, 14]), 'and')).toBe('5-7 and 11-14');
    expect(formatRanges(seatRanges([3]), 'and')).toBe('3');
    expect(formatRanges(seatRanges([1, 3, 5]), 'and')).toBe('1, 3 and 5');
  });
});
