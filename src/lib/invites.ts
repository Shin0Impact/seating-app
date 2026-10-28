import type { Guest, Layout, TableEl } from './layout';

/** 24 random bytes as base64url (32 characters): unguessable, safe in a URL and in a QR code. */
export function makeToken(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(24);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const isToken = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(s);

export type InviteDraft = { guestId: string; memberIds: string[]; partySize: number };

const PLUS = /^(.*\S)\s\+(\d{1,3})$/;

/**
 * One invite per named guest. The CSV import writes the people who come with a guest as "Name +1", "Name +2" in
 * the same group, so those become members of the named guest's invite instead of getting links of their own.
 */
export function inviteDrafts(guests: Guest[]): InviteDraft[] {
  const names = new Map<string, Guest>();
  for (const g of guests) if (!PLUS.test(g.name)) names.set(`${g.group}\u0000${g.name}`, g);
  const members = new Map<string, string[]>();
  const standalone: Guest[] = [];
  for (const g of guests) {
    const m = PLUS.exec(g.name);
    const head = m ? names.get(`${g.group}\u0000${m[1]}`) : undefined;
    if (head) members.set(head.id, [...(members.get(head.id) ?? []), g.id]);
    else if (m) standalone.push(g); // "+1" without its named guest: keep an invite so nobody is lost
  }
  const heads = guests.filter((g) => !PLUS.test(g.name));
  return [...heads, ...standalone].map((g) => {
    const extra = members.get(g.id) ?? [];
    return { guestId: g.id, memberIds: extra, partySize: 1 + extra.length };
  });
}

export type Placement = { name: string; table: string | null; seat: number | null; tableId: string | null };

/** Where the people on an invite sit: table label and chair number (1-based, as printed on the plan). */
export function locate(layout: Layout, ids: string[]): Placement[] {
  const byId = new Map(layout.guests.map((g) => [g.id, g]));
  const tables = new Map(layout.elements.filter((e): e is TableEl => e.kind === 'table').map((t) => [t.id, t]));
  return ids.flatMap((id) => {
    const g = byId.get(id);
    if (!g) return [];
    const t = g.tableId ? tables.get(g.tableId) : undefined;
    return [{ name: g.name, table: t ? t.label : null, seat: t && g.seat !== null ? g.seat + 1 : null, tableId: t ? t.id : null }];
  });
}
