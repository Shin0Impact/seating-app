import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import {
  Element,
  Guest,
  Layout,
  LIMITS,
  firstFreeSeat,
  nearestChair,
  newGuest,
  normalizeSeats,
  settleSeats,
  waitingCounts,
  seatGuest,
  seatMany,
  tableAt,
  type TableEl,
} from '@/lib/layout';
import type { Key } from '@/lib/i18n';
import { partyOf, patchGuest, removeParty, seatParty } from '@/lib/party';

const tablesIn = (l: Layout) => l.elements.filter((e): e is TableEl => e.kind === 'table');

type Picker = { tableId: string; seat: number; x: number; y: number };

type Deps = {
  t: (k: Key) => string;
  layoutRef: MutableRefObject<Layout>;
  peopleSelRef: MutableRefObject<string[]>;
  commit: (next: Layout, key?: string) => void;
  picker: Picker | null;
  setPicker: (p: Picker | null) => void;
  setSelection: Dispatch<SetStateAction<string[]>>;
  setSelectedId: (id: string | null) => void;
  setPeopleSel: (ids: string[]) => void;
  setToast: (msg: string) => void;
  setPendingDelete: (p: { text: string; run: () => void } | null) => void;
};

/** Everything that changes who sits where, and the tables themselves (shape, chairs, removal). */
export function useSeatingActions(d: Deps) {
  const {
    t,
    layoutRef,
    peopleSelRef,
    commit,
    picker,
    setPicker,
    setSelection,
    setSelectedId,
    setPeopleSel,
    setToast,
    setPendingDelete,
  } = d;

  const removeOne = (id: string) => {
    const run = () => {
      const l = layoutRef.current;
      commit({
        ...l,
        elements: l.elements.filter((e) => e.id !== id),
        guests: l.guests.map((g) => (g.tableId === id ? { ...g, tableId: null, seat: null } : g)),
      });
      setSelection((cur) => cur.filter((x) => x !== id));
    };
    const seated = layoutRef.current.guests.filter((g) => g.tableId === id).length;
    setPendingDelete({ text: t('confirmRemoveTables').replace('{n}', '1').replace('{k}', String(seated)), run });
  };
  const setAllSeats = (seats: number) => {
    const l = layoutRef.current;
    const elements = l.elements.map((e) => (e.kind === 'table' ? { ...e, seats } : e));
    const guests = settleSeats(elements, normalizeSeats(elements, l.guests));
    commit({ ...l, elements, guests });
    noteWaiting(
      elements,
      guests,
      elements.filter((e) => e.kind === 'table').map((e) => e.id),
    );
  };
  const pickGuest = (guestId: string) => {
    if (!picker) return;
    const l = layoutRef.current;
    const guests = seatParty(tablesIn(l), l.guests, guestId, picker.tableId, picker.seat, seatGuest);
    commit({ ...l, guests });
    noteWaiting(l.elements, guests, [picker.tableId]);
    setSelectedId(picker.tableId);
    setPicker(null);
  };
  const addAndSeat = (name: string) => {
    if (!picker) return;
    const l = layoutRef.current;
    const g = newGuest(name.slice(0, LIMITS.nameMax), '', null, false);
    commit({ ...l, guests: seatGuest([...l.guests, g], g.id, picker.tableId, picker.seat) });
    setSelectedId(picker.tableId);
    setPicker(null);
  };
  const editGuest = (id: string, patch: Partial<Guest>) => {
    const l = layoutRef.current;
    const clean = { ...patch };
    if (clean.name !== undefined) clean.name = clean.name.slice(0, LIMITS.nameMax);
    if (clean.group !== undefined) clean.group = clean.group.slice(0, LIMITS.nameMax);
    // a new name or group for a named guest goes to their +1s too
    commit({ ...l, guests: patchGuest(l.guests, id, clean) }, `guest:${id}`);
  };
  const removeGuestById = (id: string) => {
    const party = partyOf(layoutRef.current.guests, id);
    const name = party[0]?.name ?? '';
    setPicker(null);
    setPendingDelete({
      text: t('confirmRemoveGuest').replace('{name}', party.length > 1 ? `${name} (+${party.length - 1})` : name),
      run: () => {
        const l = layoutRef.current;
        commit({ ...l, guests: removeParty(l.guests, id) });
      },
    });
  };
  /** Delete several guests (and the +1s of any named guest among them), after asking. */
  const removeGuests = (ids: string[]) => {
    const l0 = layoutRef.current;
    const all = new Set<string>();
    for (const id of ids) for (const g of partyOf(l0.guests, id)) all.add(g.id);
    if (all.size === 0) return;
    setPicker(null);
    setPendingDelete({
      text: t('confirmRemoveGuests').replace('{n}', String(all.size)),
      run: () => {
        const l = layoutRef.current;
        commit({ ...l, guests: l.guests.filter((g) => !all.has(g.id)) });
        setPeopleSel([]);
      },
    });
  };
  /** Turn the given tables round or rectangular; chairs and guests stay with them. */
  const setShape = (ids: string[], shape: 'round' | 'rect') => {
    const l = layoutRef.current;
    commit({
      ...l,
      elements: l.elements.map((e) =>
        e.kind === 'table' && ids.includes(e.id)
          ? ({ ...e, shape, ...(shape === 'round' ? { half: undefined } : {}) } as Element)
          : e,
      ),
    });
  };
  const emptyChair = (guestId: string) => {
    const l = layoutRef.current;
    commit({ ...l, guests: seatParty(tablesIn(l), l.guests, guestId, null, null, seatGuest) });
    setPicker(null);
  };

  /** Fewer chairs never takes anyone off the table: who no longer has a chair waits at it, and sits again when one frees up. */
  const changeSeats = (id: string, seats: number) => {
    const l = layoutRef.current;
    const elements = l.elements.map((e) => (e.id === id ? ({ ...e, seats } as Element) : e));
    const guests = settleSeats(elements, normalizeSeats(elements, l.guests));
    commit({ ...l, elements, guests }, `${id}:seats`);
    noteWaiting(elements, guests, [id]);
  };

  /** A small notice when people at these tables are waiting for a chair. */
  const noteWaiting = (elements: Element[], guests: Guest[], ids: string[]) => {
    const w = waitingCounts(guests);
    for (const tid of ids) {
      const n = w.get(tid) ?? 0;
      if (n === 0) continue;
      const tb = elements.find((e) => e.id === tid);
      setToast(
        t('tableFullWaiting')
          .replace('{table}', tb?.label ?? '')
          .replace('{n}', String(n)),
      );
      return;
    }
  };

  /** Which table and chair a drop at this world position means, if any. */
  const resolveDrop = (wx: number, wy: number, ignoreId?: string) => {
    const l = layoutRef.current;
    const c = nearestChair(l.elements, l.settings, wx, wy, 0.6);
    if (c) return { tableId: c.tableId, seat: c.seat as number | null };
    const tb = tableAt(l.elements, l.settings, wx, wy);
    if (tb) return { tableId: tb.id, seat: firstFreeSeat(tb, l.guests, ignoreId) };
    return null;
  };

  /** Move a guest (and their +1s) to another table, on its first free chairs; null takes them off their table. */
  const moveToTable = (guestId: string, tableId: string | null) => {
    const l = layoutRef.current;
    const tb = tableId ? tablesIn(l).find((x) => x.id === tableId) : undefined;
    const guests = seatParty(
      tablesIn(l),
      l.guests,
      guestId,
      tb ? tb.id : null,
      tb ? firstFreeSeat(tb, l.guests, guestId) : null,
      seatGuest,
    );
    commit({ ...l, guests });
    if (tb) noteWaiting(l.elements, guests, [tb.id]);
  };

  /** Take everyone in a group off their tables, after asking. */
  const unseatGroup = (group: string) => {
    const n = layoutRef.current.guests.filter((g) => g.group === group && g.tableId).length;
    if (n === 0) return;
    setPendingDelete({
      text: t('confirmUnseatGroup').replace('{group}', group).replace('{n}', String(n)),
      run: () => {
        const l = layoutRef.current;
        commit({ ...l, guests: l.guests.map((g) => (g.group === group ? { ...g, tableId: null, seat: null } : g)) });
        setToast(`${n} ${t('unseatedN')}`);
      },
    });
  };

  const idsOfGroup = (group: string) =>
    layoutRef.current.guests.filter((g) => g.group === group && !g.tableId).map((g) => g.id);

  /** Seat several guests at the table (or chair) under a drop point, filling chairs in order. */
  const dropMany = (ids: string[], wx: number, wy: number) => {
    const l = layoutRef.current;
    const r = resolveDrop(wx, wy);
    if (!r || ids.length === 0) return;
    const res = seatMany(l.elements, l.settings, l.guests, ids, r.tableId, r.seat);
    if (res.placed > 0) {
      commit({ ...l, guests: res.guests });
      setSelectedId(r.tableId);
    }
    setToast(
      res.left > 0 ? `${res.placed} ${t('seatedN')} · ${res.left} ${t('didNotFit')}` : `${res.placed} ${t('seatedN')}`,
    );
  };

  const dropGuest = (guestId: string, wx: number, wy: number) => {
    const sel = peopleSelRef.current;
    if (sel.length > 1 && sel.includes(guestId)) {
      dropMany([guestId, ...sel.filter((x) => x !== guestId)], wx, wy);
      setPeopleSel([]);
      return;
    }
    const l = layoutRef.current;
    const me = l.guests.find((g) => g.id === guestId);
    const r = resolveDrop(wx, wy, guestId);
    if (!me || !r) return;
    if (me.tableId === r.tableId && me.seat === r.seat) return; // dropped back where it was
    // a named guest brings their +1s along
    const guests = seatParty(tablesIn(l), l.guests, guestId, r.tableId, r.seat, seatGuest);
    commit({ ...l, guests });
    noteWaiting(l.elements, guests, [r.tableId]);
    setSelectedId(r.tableId);
  };

  return {
    removeOne,
    setAllSeats,
    pickGuest,
    addAndSeat,
    editGuest,
    removeGuestById,
    removeGuests,
    setShape,
    emptyChair,
    changeSeats,
    resolveDrop,
    idsOfGroup,
    unseatGroup,
    moveToTable,
    dropMany,
    dropGuest,
  };
}
