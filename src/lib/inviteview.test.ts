import { describe, expect, it } from 'vitest';
import { DEFAULT_TEMPLATE, fillMessage, inviteState, totals, whatsappUrl, type InviteRow } from './inviteview';

const row = (o: Partial<InviteRow> = {}): InviteRow => ({ token: 't'.repeat(32), guest_id: 'g', party_size: 2, status: 'pending', confirmed_count: null, checked_in_at: null, sent_at: null, ...o });

describe('inviteState', () => {
  it('moves through the stages', () => {
    expect(inviteState(row())).toBe('unsent');
    expect(inviteState(row({ sent_at: 'x' }))).toBe('waiting');
    expect(inviteState(row({ status: 'confirmed' }))).toBe('confirmed');
    expect(inviteState(row({ status: 'declined' }))).toBe('declined');
    expect(inviteState(row({ status: 'confirmed', checked_in_at: 'x' }))).toBe('arrived');
  });
});

describe('totals', () => {
  it('counts people, sent and confirmed', () => {
    const t = totals([
      row({ party_size: 4, sent_at: 'x' }),
      row({ party_size: 3, status: 'confirmed', confirmed_count: 2 }),
      row({ party_size: 1, status: 'declined' }),
      row({ party_size: 2, status: 'confirmed', confirmed_count: null, checked_in_at: 'x' }),
    ]);
    expect(t).toEqual({ families: 4, people: 10, sent: 4, confirmedFamilies: 2, confirmedPeople: 4, declined: 1, arrived: 1 });
  });
});

describe('message', () => {
  it('fills every placeholder and builds a whatsapp link', () => {
    const m = fillMessage(DEFAULT_TEMPLATE, { name: 'نبيل', event: 'حفل', link: 'https://x/r/abc', people: 4 });
    expect(m).toContain('نبيل');
    expect(m).toContain('https://x/r/abc');
    expect(m).not.toContain('{');
    expect(whatsappUrl('a b&c')).toBe('https://wa.me/?text=a%20b%26c');
  });
});
