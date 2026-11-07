import { describe, expect, it } from 'vitest';
import { membersOf, patchGuest, removeParty, seatParty, setPartySize } from './party';
import { newGuest, newTable, seatGuest, type Guest } from './layout';

const t1 = { ...newTable(0, 0, 'round', 4, 1), id: 't1' };
const t2 = { ...newTable(5, 0, 'round', 6, 2), id: 't2' };
const mk = (id: string, name: string, tableId: string | null = null, seat: number | null = null): Guest => ({
  ...newGuest(name, 'Fam', tableId, false),
  id,
  seat,
});
const party = () => [
  mk('h', 'Sami', 't1', 0),
  mk('k1', 'Sami +1', 't1', 1),
  mk('k2', 'Sami +2', 't1', 2),
  mk('o', 'Other'),
];
const by = (gs: Guest[], id: string) => gs.find((g) => g.id === id)!;

describe('parties', () => {
  it('finds the +1s of a named guest', () => {
    expect(membersOf(party(), party()[0]).map((g) => g.id)).toEqual(['k1', 'k2']);
  });
  it('renaming or regrouping the named guest carries over to the +1s', () => {
    const g = patchGuest(party(), 'h', { name: 'Sami K', group: 'B' });
    expect(by(g, 'k1')).toMatchObject({ name: 'Sami K +1', group: 'B' });
    expect(by(g, 'k2').name).toBe('Sami K +2');
    expect(membersOf(g, by(g, 'h'))).toHaveLength(2);
  });
  it('an emptied name keeps the +1s attached until a new name is typed', () => {
    const g1 = patchGuest(party(), 'h', { name: '' });
    expect(by(g1, 'k1').name).toBe('Sami +1');
    const g2 = patchGuest(g1, 'h', { name: 'Sami' });
    expect(membersOf(g2, by(g2, 'h'))).toHaveLength(2);
  });
  it('removing the named guest removes the party', () => {
    expect(removeParty(party(), 'h').map((g) => g.id)).toEqual(['o']);
  });
  it('moving the named guest to another table brings the +1s to the next chairs', () => {
    const g = seatParty([t1, t2], party(), 'h', 't2', 3, seatGuest);
    expect([by(g, 'h').seat, by(g, 'k1').seat, by(g, 'k2').seat]).toEqual([3, 4, 5]);
    expect(by(g, 'k2').tableId).toBe('t2');
  });
  it('a full table: the +1s that do not fit wait at it', () => {
    const full = [
      ...party(),
      mk('x', 'X', 't2', 0),
      mk('y', 'Y', 't2', 1),
      mk('z', 'Z', 't2', 2),
      mk('w', 'W', 't2', 3),
    ];
    const g = seatParty([t1, t2], full, 'h', 't2', 4, seatGuest);
    expect(by(g, 'k1')).toMatchObject({ tableId: 't2', seat: 5 });
    expect(by(g, 'k2')).toMatchObject({ tableId: 't2', seat: null });
  });
  it('unseating the named guest unseats the +1s', () => {
    const g = seatParty([t1, t2], party(), 'h', null, null, seatGuest);
    expect(g.filter((x) => x.tableId).length).toBe(0);
  });
  it('another chair at the same table leaves the +1s', () => {
    const g = seatParty([t1, t2], party(), 'h', 't1', 3, seatGuest);
    expect([by(g, 'k1').seat, by(g, 'k2').seat]).toEqual([1, 2]);
  });
  it('+N up adds people after the party at the same table; down removes the last ones', () => {
    const up = setPartySize(party(), 'h', 4);
    expect(up.map((g) => g.name)).toEqual(['Sami', 'Sami +1', 'Sami +2', 'Sami +3', 'Sami +4', 'Other']);
    expect(by(up, up[3].id).tableId).toBe('t1');
    const down = setPartySize(up, 'h', 1);
    expect(down.map((g) => g.name)).toEqual(['Sami', 'Sami +1', 'Other']);
  });
  it('+N keeps the sure/maybe guess consistent', () => {
    const gs = party().map((g) => (g.id === 'h' ? { ...g, expect: { sure: 1, maybe: 2, seq: 'smm' } } : g));
    expect(by(setPartySize(gs, 'h', 3), 'h').expect).toEqual({ sure: 2, maybe: 2, seq: 'smms' });
    expect(by(setPartySize(gs, 'h', 0), 'h').expect).toEqual({ sure: 1, maybe: 0, seq: 's' });
  });
});
