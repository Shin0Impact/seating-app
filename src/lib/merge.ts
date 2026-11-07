import { normalizeSeats, settleSeats, type Element, type Guest, type Layout } from './layout';

/**
 * Three-way merge of two edited copies of the same plan (two phones editing at once).
 * `base` is what both started from (the last version this device saw on the server), `mine` is this device's
 * current plan and `theirs` is the newer version someone else saved. Each guest and each element is merged field by
 * field: a field one side changed takes that side's value; when both changed the same field, `mine` wins (it is the
 * newest edit, and the other device will in turn see it). Something one side removed stays removed unless the other
 * side changed it in the meantime.
 */
export function merge3(base: Layout, mine: Layout, theirs: Layout): Layout {
  const merged: Layout = {
    ...theirs,
    settings: mergeFields(base.settings, mine.settings, theirs.settings),
    elements: mergeList<Element>(base.elements, mine.elements, theirs.elements, ELEMENT_GROUPS),
    guests: mergeList<Guest>(base.guests, mine.guests, theirs.guests, GUEST_GROUPS),
  };
  if (mine.options || theirs.options)
    merged.options = mergeFields(base.options ?? {}, mine.options ?? {}, theirs.options ?? {}) as Layout['options'];
  // two people may have put different guests on the same chair, or a guest on a table someone else removed
  return { ...merged, guests: settleSeats(merged.elements, normalizeSeats(merged.elements, merged.guests)) };
}

/** Fields that only make sense together: a guest's table and chair, an element's position. */
const GUEST_GROUPS: string[][] = [['tableId', 'seat']];
const ELEMENT_GROUPS: string[][] = [['x', 'y']];

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeFields<T extends object>(base: T, mine: T, theirs: T, groups: string[][] = []): T {
  const b = base as Record<string, unknown>;
  const m = mine as Record<string, unknown>;
  const t = theirs as Record<string, unknown>;
  const out: Record<string, unknown> = { ...t };
  const grouped = new Set(groups.flat());
  for (const k of new Set([...Object.keys(m), ...Object.keys(t), ...Object.keys(b)])) {
    if (grouped.has(k)) continue;
    if (!same(m[k], b[k])) {
      if (m[k] === undefined) delete out[k];
      else out[k] = m[k];
    }
  }
  for (const g of groups) {
    const mineChanged = g.some((k) => !same(m[k], b[k]));
    for (const k of g) {
      const v = mineChanged ? m[k] : t[k];
      if (v === undefined) delete out[k];
      else out[k] = v;
    }
  }
  return out as T;
}

function mergeList<T extends { id: string }>(base: T[], mine: T[], theirs: T[], groups: string[][]): T[] {
  const b = new Map(base.map((x) => [x.id, x]));
  const m = new Map(mine.map((x) => [x.id, x]));
  const out: T[] = [];
  const done = new Set<string>();
  for (const tx of theirs) {
    done.add(tx.id);
    const bx = b.get(tx.id);
    const mx = m.get(tx.id);
    if (!bx) {
      out.push(mx ? mergeFields(tx, mx, tx, groups) : tx); // added on their side (or on both)
      continue;
    }
    if (!mx) {
      // I removed it: gone, unless they changed it since
      if (!same(bx, tx)) out.push(tx);
      continue;
    }
    out.push(mergeFields(bx, mx, tx, groups));
  }
  for (const mx of mine) {
    if (done.has(mx.id)) continue;
    const bx = b.get(mx.id);
    if (!bx)
      out.push(mx); // I added it
    else if (!same(bx, mx)) out.push(mx); // they removed it but I changed it: keep mine
  }
  return out;
}
