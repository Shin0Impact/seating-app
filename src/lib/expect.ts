// Who is expected to come: the planner's own guess per invitation (sure / maybe / courtesy), replaced by the
// family's answer once they reply. Planner-only: nothing here is ever sent to a guest.

import { DEFAULT_OPTIONS, LIMITS, type Expect, type Guest, type Layout, type TableEl } from './layout';
import { inviteDrafts } from './invites';
import { normalize } from './search';
import type { InviteRow } from './inviteview';

export type ExpectKind = 'sure' | 'maybe' | 'court';
export type Counts = { sure: number; maybe: number; court: number };

/** The planner's guess for an invite of `size` people. No guess means everyone is sure. */
export function planned(head: Pick<Guest, 'expect'> | undefined, size: number): Counts {
  const e = head?.expect;
  if (!e) return { sure: size, maybe: 0, court: 0 };
  const sure = Math.min(size, Math.max(0, e.sure));
  const maybe = Math.min(size - sure, Math.max(0, e.maybe));
  return { sure, maybe, court: size - sure - maybe };
}

/**
 * What an invite adds to the totals. The family's own answer wins: confirmed means their confirmed number is sure,
 * declined means nobody is expected. Otherwise the planner's guess stands.
 */
export function expected(
  head: Pick<Guest, 'expect'> | undefined,
  size: number,
  row?: Pick<InviteRow, 'status' | 'confirmed_count' | 'party_size'>,
): Counts & { answered: boolean } {
  if (row?.status === 'confirmed')
    return { sure: row.confirmed_count ?? row.party_size, maybe: 0, court: 0, answered: true };
  if (row?.status === 'declined') return { sure: 0, maybe: 0, court: 0, answered: true };
  return { ...planned(head, row?.party_size ?? size), answered: false };
}

/** The one-word label for an invite: anyone maybe → maybe; nobody expected → courtesy; else sure. */
export function kindOf(c: Counts): ExpectKind {
  if (c.sure + c.maybe === 0) return 'court';
  return c.maybe > 0 ? 'maybe' : 'sure';
}

export const EMPTY: Counts = { sure: 0, maybe: 0, court: 0 };

/** Totals over every invitation in the plan, using answers from `rows` where a family has replied. */
export function expectTotals(guests: Guest[], rows: InviteRow[] = []): Counts {
  const byGuest = new Map(guests.map((g) => [g.id, g]));
  const byHead = new Map(rows.map((r) => [r.guest_id, r]));
  const t = { ...EMPTY };
  for (const d of inviteDrafts(guests)) {
    const c = expected(byGuest.get(d.guestId), d.partySize, byHead.get(d.guestId));
    t.sure += c.sure;
    t.maybe += c.maybe;
    t.court += c.court;
  }
  return t;
}

/** Chairs the plan needs: the sure people, plus the maybe people when they get a chair. */
export const chairsNeeded = (t: Counts, maybeSeats = DEFAULT_OPTIONS.maybeSeats) => t.sure + (maybeSeats ? t.maybe : 0);

/** Every chair in the hall. */
export const chairsInHall = (layout: Pick<Layout, 'elements'>) =>
  layout.elements.reduce((n, e) => n + (e.kind === 'table' ? (e as TableEl).seats : 0), 0);

/**
 * Each person's part of their invite's guess, for drawing the plan: the named guest and the first "+1"s are the sure
 * ones, the next are maybe, the rest courtesy ("+3" is only a placeholder, so which placeholder is which does not matter).
 */
export function roles(guests: Guest[]): Map<string, ExpectKind> {
  const byGuest = new Map(guests.map((g) => [g.id, g]));
  const out = new Map<string, ExpectKind>();
  for (const d of inviteDrafts(guests)) {
    const c = planned(byGuest.get(d.guestId), d.partySize);
    [d.guestId, ...d.memberIds].forEach((id, i) =>
      out.set(id, i < c.sure ? 'sure' : i < c.sure + c.maybe ? 'maybe' : 'court'),
    );
  }
  return out;
}

const WORDS: Record<ExpectKind, RegExp> = {
  sure: /(اكيد|موكد|مضمون|sure|yes|definite|certain|בטוח)/,
  maybe: /(ممكن|محتمل|ربما|يمكن|maybe|perhaps|possibl|אולי)/,
  court: /(واجب|مجامله|احترام|courtesy|respect|לא מגיע|נימוס)/,
};

/**
 * Reads an import cell such as «أكيد», «ممكن», «واجب», «3 أكيد 2 ممكن» or «أكيد 3، ممكن 2» for an invite of `size`.
 * A bare number means that many are sure. Empty or unreadable: no guess (everyone sure).
 */
export function readExpectCell(cell: string, size: number): Expect | undefined {
  const s = normalize(cell ?? '')
    .replace(/[,،;+/]/g, ' ')
    .trim();
  if (!s) return undefined;
  const clamp = (n: number) => Math.max(0, Math.min(size, Math.min(LIMITS.maxParty, n)));
  const numNear = (re: RegExp): number | null => {
    const m = new RegExp(`(\\d+)\\s*${re.source}|${re.source}\\s*(\\d+)`).exec(s);
    if (!m) return null;
    const v = m[1] ?? m[m.length - 1];
    return v === undefined ? null : parseInt(v, 10);
  };
  const has = (k: ExpectKind) => WORDS[k].test(s);
  const sureN = numNear(WORDS.sure);
  const maybeN = numNear(WORDS.maybe);
  if (sureN !== null || maybeN !== null) {
    const sure = clamp(sureN ?? 0);
    return { sure, maybe: Math.min(size - sure, clamp(maybeN ?? 0)) };
  }
  if (has('court')) return { sure: 0, maybe: 0 };
  if (has('maybe')) return { sure: 0, maybe: size };
  if (has('sure')) return { sure: size, maybe: 0 };
  if (/^\d+$/.test(s)) return { sure: clamp(parseInt(s, 10)), maybe: 0 };
  return undefined;
}
