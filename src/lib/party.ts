// A party is a named guest and the people who come with them ("Sami", "Sami +1", "Sami +2", same group).
// The +1s are tied to their named guest only by name and group, so every change to the named guest is carried over
// to them here: renaming, regrouping, moving to another table, unseating and removing. Nobody is left behind as an
// orphaned "+1" with a name that no longer matches anyone.

import { LIMITS, newGuest, type Guest, type TableEl } from './layout';
import { PLUS } from './invites';

const plusNo = (g: Guest) => Number(PLUS.exec(g.name)?.[2] ?? 0);

/** The people who come with this guest, in order (+1, +2, …). Empty for a "+k" person or someone alone. */
export function membersOf(guests: Guest[], head: Guest): Guest[] {
  if (!head.name.trim() || PLUS.test(head.name)) return [];
  return guests
    .filter((g) => {
      const m = PLUS.exec(g.name);
      return !!m && m[1] === head.name && g.group === head.group;
    })
    .sort((a, b) => plusNo(a) - plusNo(b));
}

/** The guest followed by the people who come with them. */
export function partyOf(guests: Guest[], id: string): Guest[] {
  const g = guests.find((x) => x.id === id);
  return g ? [g, ...membersOf(guests, g)] : [];
}

/** Change a guest; a new name or group for a named guest is carried over to their +1s. */
export function patchGuest(guests: Guest[], id: string, patch: Partial<Guest>): Guest[] {
  const me = guests.find((g) => g.id === id);
  if (!me) return guests;
  const name = patch.name ?? me.name;
  const group = patch.group ?? me.group;
  const kids = name !== me.name || group !== me.group ? membersOf(guests, me) : [];
  // while the name box is emptied mid-typing, the +1s keep the old name until a new one is typed
  const kidBase = name.trim() ? name : me.name;
  const kid = new Map(kids.map((k) => [k.id, { name: `${kidBase} +${plusNo(k)}`.slice(0, LIMITS.nameMax), group }]));
  return guests.map((g) => (g.id === id ? { ...g, ...patch } : kid.has(g.id) ? { ...g, ...kid.get(g.id)! } : g));
}

/** Remove a guest together with the people who come with them. */
export function removeParty(guests: Guest[], id: string): Guest[] {
  const ids = new Set(partyOf(guests, id).map((g) => g.id));
  return guests.filter((g) => !ids.has(g.id));
}

/**
 * Seat (or unseat) a guest and bring their party along: when the named guest goes to another table, their +1s take
 * the next free chairs after them there; if the table is full they wait at it for a chair. Unseating the named guest
 * unseats the +1s. Moving to another chair at the same table leaves the +1s where they are.
 */
export function seatParty(
  tables: TableEl[],
  guests: Guest[],
  id: string,
  tableId: string | null,
  seat: number | null,
  seatOne: (guests: Guest[], id: string, tableId: string | null, seat: number | null) => Guest[],
): Guest[] {
  const before = guests.find((g) => g.id === id);
  let next = seatOne(guests, id, tableId, seat);
  const me = next.find((g) => g.id === id);
  if (!before || !me) return next;
  const kids = membersOf(next, me);
  if (kids.length === 0) return next;
  if (tableId === null) {
    const ids = new Set(kids.map((k) => k.id));
    return next.map((g) => (ids.has(g.id) ? { ...g, tableId: null, seat: null } : g));
  }
  const moving = kids.filter((k) => k.tableId !== tableId).map((k) => k.id);
  if (moving.length === 0) return next;
  const table = tables.find((t) => t.id === tableId);
  if (!table) return next;
  const taken = new Set(
    next.filter((g) => g.tableId === tableId && g.seat !== null && !moving.includes(g.id)).map((g) => g.seat!),
  );
  const from = me.seat !== null ? me.seat + 1 : 0;
  const free: number[] = [];
  for (let k = 0; k < table.seats; k++) {
    const s = (from + k) % table.seats;
    if (!taken.has(s)) free.push(s);
  }
  const give = new Map(moving.map((mid, k) => [mid, k < free.length ? free[k] : null]));
  next = next.map((g) => (give.has(g.id) ? { ...g, tableId, seat: give.get(g.id)! } : g));
  return next;
}

/**
 * Make a named guest's party this many extra people (+N). New people join as "Name +k" in the same group, at the
 * same table (they take free chairs there, or wait for one), and count as sure. Lowering it removes the last ones.
 */
export function setPartySize(guests: Guest[], headId: string, extra: number): Guest[] {
  const head = guests.find((g) => g.id === headId);
  if (!head || PLUS.test(head.name) || !head.name.trim()) return guests;
  const kids = membersOf(guests, head);
  const want = Math.max(0, Math.min(99, Math.floor(extra)));
  const room = LIMITS.maxGuests - guests.length;
  let next = guests;
  if (want > kids.length) {
    const add = Math.min(want - kids.length, room);
    let k = kids.length ? plusNo(kids[kids.length - 1]) : 0;
    const fresh: Guest[] = [];
    for (let i = 0; i < add; i++) {
      k += 1;
      fresh.push({
        ...newGuest(`${head.name} +${k}`.slice(0, LIMITS.nameMax), head.group, head.tableId, head.stepFree),
        seat: null,
      });
    }
    // put them right after the party in the list
    const lastIdx = Math.max(...[head, ...kids].map((g) => guests.indexOf(g)));
    next = [...guests.slice(0, lastIdx + 1), ...fresh, ...guests.slice(lastIdx + 1)];
  } else if (want < kids.length) {
    const drop = new Set(kids.slice(want).map((g) => g.id));
    next = guests.filter((g) => !drop.has(g.id));
  } else return guests;
  const size = 1 + Math.min(want, kids.length + room);
  const oldSize = 1 + kids.length;
  return next.map((g) => (g.id === headId && g.expect ? { ...g, expect: resizeExpect(g.expect, oldSize, size) } : g));
}

function resizeExpect(e: NonNullable<Guest['expect']>, oldSize: number, size: number): NonNullable<Guest['expect']> {
  let sure = e.sure;
  let maybe = e.maybe;
  if (size > oldSize) sure += size - oldSize; // the new people are sure
  sure = Math.min(sure, size);
  maybe = Math.min(maybe, size - sure);
  const out: NonNullable<Guest['expect']> = { sure, maybe };
  if (e.seq && e.seq.length === oldSize) {
    const seq = size > oldSize ? e.seq + 's'.repeat(size - oldSize) : e.seq.slice(0, size);
    const n = (c: string) => [...seq].filter((x) => x === c).length;
    if (n('s') === sure && n('m') === maybe) out.seq = seq;
  }
  return out;
}
