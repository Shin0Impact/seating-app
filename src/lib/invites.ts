import type { Guest, Layout, TableEl } from './layout';

/** 24 random bytes as base64url (32 characters): unguessable, safe in a URL and in a QR code. */
export function makeToken(
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  const bytes = random(24);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const isToken = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(s);

export type InviteDraft = { guestId: string; memberIds: string[]; partySize: number };

export const PLUS = /^(.*\S)\s*\+(\d{1,2})$/;

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
    return [
      {
        name: g.name,
        table: t ? t.label : null,
        seat: t && g.seat !== null ? g.seat + 1 : null,
        tableId: t ? t.id : null,
      },
    ];
  });
}

/** Sorted, merged runs of chair numbers: [5,6,7,11,12] -> [[5,7],[11,12]]. */
export function seatRanges(seats: number[]): [number, number][] {
  const sorted = [...new Set(seats)].sort((a, b) => a - b);
  const out: [number, number][] = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out;
}

/** "1-8" or "5-7 and 11-14" (a lone chair is just its number). */
export function formatRanges(ranges: [number, number][], and: string): string {
  const one = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}-${b}`);
  if (ranges.length <= 1) return ranges.map(one).join('');
  return ranges.slice(0, -1).map(one).join(', ') + ` ${and} ` + one(ranges[ranges.length - 1]);
}

/** "Table 3 · chairs 1-8" for the given people, one entry per table they sit at. */
export function seatsSummary(
  layout: Pick<Layout, 'elements' | 'guests'>,
  ids: string[],
  make: (table: string, count: number, chairs: string) => string,
  and: string,
): string {
  const want = new Set(ids);
  const byTable = new Map<string, number[]>();
  for (const g of layout.guests)
    if (want.has(g.id) && g.tableId && g.seat !== null)
      byTable.set(g.tableId, [...(byTable.get(g.tableId) ?? []), g.seat + 1]);
  return [...byTable.entries()]
    .map(([id, seats]) =>
      make(layout.elements.find((e) => e.id === id)?.label ?? '', seats.length, formatRanges(seatRanges(seats), and)),
    )
    .join(' | ');
}
