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
  seatGuest,
  seatMany,
  tableAt,
} from '@/lib/layout';
import type { Key } from '@/lib/i18n';

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
    commit({ ...l, elements, guests: normalizeSeats(elements, l.guests) });
  };
  const pickGuest = (guestId: string) => {
    if (!picker) return;
    const l = layoutRef.current;
    commit({ ...l, guests: seatGuest(l.guests, guestId, picker.tableId, picker.seat) });
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
    commit(
      {
        ...l,
        guests: l.guests.map((g) =>
          g.id === id
            ? {
                ...g,
                ...patch,
                name: (patch.name ?? g.name).slice(0, LIMITS.nameMax),
                group: (patch.group ?? g.group).slice(0, LIMITS.nameMax),
              }
            : g,
        ),
      },
      `guest:${id}`,
    );
  };
  const removeGuestById = (id: string) => {
    const name = layoutRef.current.guests.find((g) => g.id === id)?.name ?? '';
    setPicker(null);
    setPendingDelete({
      text: t('confirmRemoveGuest').replace('{name}', name),
      run: () => {
        const l = layoutRef.current;
        commit({ ...l, guests: l.guests.filter((g) => g.id !== id) });
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
    commit({ ...l, guests: seatGuest(l.guests, guestId, null, null) });
    setPicker(null);
  };

  const changeSeats = (id: string, seats: number) => {
    const l = layoutRef.current;
    const elements = l.elements.map((e) => (e.id === id ? ({ ...e, seats } as Element) : e));
    commit({ ...l, elements, guests: normalizeSeats(elements, l.guests) }, `${id}:seats`);
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
    commit({ ...l, guests: seatGuest(l.guests, guestId, r.tableId, r.seat) });
    setSelectedId(r.tableId);
  };

  return {
    removeOne,
    setAllSeats,
    pickGuest,
    addAndSeat,
    editGuest,
    removeGuestById,
    setShape,
    emptyChair,
    changeSeats,
    resolveDrop,
    idsOfGroup,
    dropMany,
    dropGuest,
  };
}
