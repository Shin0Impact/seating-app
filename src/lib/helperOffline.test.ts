import { describe, expect, it } from 'vitest';
import { enqueue, overlay, pendingInvites, walkinToken, type HelperData, type HelperOp } from './helperOffline';

const inv = (token: string, extra = {}) => ({
  token,
  guest_id: `g-${token}`,
  member_ids: [],
  party_size: 3,
  status: 'pending',
  confirmed_count: null,
  checked_in_at: null,
  ...extra,
});
const data: HelperData = { name: 'E', layout: { guests: [{ id: 'g-a' }] }, invites: [inv('a'), inv('b')] };
const op = (o: Partial<HelperOp> & { kind: HelperOp['kind'] }): HelperOp =>
  ({ id: Math.random().toString(), at: '2026-11-20T18:05:00Z', ...o }) as HelperOp;

describe('door desk queue', () => {
  it('keeps only the newest arrived/undo per invite', () => {
    let q: HelperOp[] = [];
    q = enqueue(q, op({ kind: 'checkin', invite: 'a', count: 3, undo: false }));
    q = enqueue(q, op({ kind: 'checkin', invite: 'b', count: 2, undo: false }));
    q = enqueue(q, op({ kind: 'checkin', invite: 'a', count: 1, undo: true }));
    expect(q.map((x) => (x.kind === 'checkin' ? `${x.invite}${x.undo ? 'u' : ''}` : x.kind))).toEqual(['b', 'au']);
  });
  it('a scan does not replace a waiting check-in', () => {
    let q = enqueue([], op({ kind: 'checkin', invite: 'a', count: 2, undo: false }));
    q = enqueue(q, op({ kind: 'scan', invite: 'a' }));
    expect(q).toHaveLength(1);
  });
  it('shows taps as done, keeping the time they were made', () => {
    const q = [op({ kind: 'checkin', invite: 'a', count: 2, undo: false })];
    const o = overlay(data, q);
    expect(o.invites[0]).toMatchObject({
      checked_in_at: '2026-11-20T18:05:00Z',
      confirmed_count: 2,
      status: 'confirmed',
    });
    expect(
      overlay(o, [op({ kind: 'checkin', invite: 'a', count: 1, undo: true })]).invites[0].checked_in_at,
    ).toBeNull();
  });
  it('a walk-in shows at once, and only once after the server has it', () => {
    const key = '11111111-2222-4333-8444-555555555555';
    const q = [op({ kind: 'walkin', key, name: 'New', count: 2 })];
    const o = overlay(data, q);
    expect(o.invites.at(-1)).toMatchObject({ token: walkinToken(key), party_size: 2 });
    expect((o.layout as { guests: unknown[] }).guests).toHaveLength(2);
    const server = { ...data, invites: [...data.invites, inv(walkinToken(key))] };
    expect(overlay(server, q).invites).toHaveLength(3);
    expect(pendingInvites(q).has(walkinToken(key))).toBe(true);
  });
});
