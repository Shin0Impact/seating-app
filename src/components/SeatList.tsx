'use client';

import { coarsePointer } from '@/lib/touchdrag';
import { kindOf, planned } from '@/lib/expect';
import { useMemo, useState } from 'react';
import { Guest, TableEl } from '@/lib/layout';
import { inviteDrafts } from '@/lib/invites';
import { Key } from '@/lib/i18n';
import { matches } from '@/lib/search';
import { Icon } from './Icon';

const SHOWN = 120;

/** Compact list inside the hall view: drag a guest from here onto a chair. */
export function SeatList({
  t,
  guests,
  tables,
  onEdit,
  peopleTool,
  picked,
  onToggle,
}: {
  t: (k: Key) => string;
  guests: Guest[];
  tables: TableEl[];
  onEdit?: (id: string, x: number, y: number) => void;
  peopleTool?: boolean;
  picked?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [onlyUnseated, setOnlyUnseated] = useState(true);
  const label = useMemo(() => new Map(tables.map((tb) => [tb.id, tb.label])), [tables]);
  const list = useMemo(
    () => guests.filter((g) => (!onlyUnseated || !g.tableId) && matches(query, g.name, g.group)),
    [guests, onlyUnseated, query],
  );
  const unseated = guests.filter((g) => !g.tableId).length;
  /** A person and the people who come with them ("Name +1", "Name +2") are one row while unseated; on the table they are separate chairs. */
  const rows = useMemo(() => {
    const byId = new Map(list.map((g) => [g.id, g]));
    const members = new Map<string, Guest[]>();
    const hidden = new Set<string>();
    for (const d of inviteDrafts(list.filter((g) => !g.tableId))) {
      const ms = d.memberIds.map((id) => byId.get(id)).filter((g): g is Guest => !!g);
      if (ms.length === 0) continue;
      members.set(d.guestId, ms);
      for (const m of ms) hidden.add(m.id);
    }
    return list.filter((g) => !hidden.has(g.id)).map((g) => ({ g, extra: members.get(g.id) ?? [] }));
  }, [list]);
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of guests) if (g.group && !g.tableId) m.set(g.group, (m.get(g.group) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [guests]);

  if (guests.length === 0) return <p className="muted">{t('noGuests')}</p>;
  return (
    <>
      <p className="totals">
        {t('noTable')}: {unseated} / {guests.length}
      </p>
      <label className="search">
        <Icon name="search" size={18} />
        <input
          type="search"
          placeholder={t('searchGuests')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('searchGuests')}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={onlyUnseated} onChange={(e) => setOnlyUnseated(e.target.checked)} />
        <span>{t('unseatedOnly')}</span>
      </label>
      {groups.length > 0 && (
        <>
          <p className="muted">{t('groupsTitle')}</p>
          <ul className="grouplist">
            {groups.map(([name, n]) => (
              <li
                key={name}
                draggable={!coarsePointer()}
                data-tdrag={`group:${name}`}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/guest-group', name);
                  e.dataTransfer.setData('text/plain', name);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                title={t('groupsTitle')}
              >
                <span className="grip" aria-hidden>
                  <Icon name="grip" />
                </span>
                <span className="sl-name" dir="auto">
                  {name}
                </span>
                <span className="gcount">{n}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {peopleTool && <p className="muted">{t('pickMode')}</p>}
      {onlyUnseated && unseated === 0 && <p className="muted">{t('allSeated')}</p>}
      <p className="muted">{t('dragToSeat')}</p>
      <ul className="seatlist">
        {rows.slice(0, SHOWN).map(({ g, extra }) => {
          const ids = [g.id, ...extra.map((m) => m.id)];
          const inPicked = !!picked && picked.has(g.id);
          const bulk = picked && picked.size > 1 && inPicked ? [g.id, ...[...picked].filter((x) => x !== g.id)] : null;
          const dragIds = bulk ?? (extra.length > 0 ? ids : null);
          return (
            <li
              key={g.id}
              className={inPicked ? 'picked' : ''}
              draggable={!coarsePointer()}
              data-tdrag={dragIds ? `guests:${dragIds.join(',')}` : `guest:${g.id}`}
              onClick={
                peopleTool
                  ? () => ids.forEach((id) => (inPicked !== picked?.has(id) ? null : onToggle?.(id)))
                  : undefined
              }
              onDragStart={(e) => {
                if (dragIds) {
                  e.dataTransfer.setData('text/guest-ids', dragIds.join(','));
                  e.dataTransfer.setData('text/plain', g.name);
                  e.dataTransfer.effectAllowed = 'move';
                  return;
                }
                e.dataTransfer.setData('text/guest-id', g.id);
                e.dataTransfer.setData('text/plain', g.name);
                e.dataTransfer.effectAllowed = 'move';
              }}
              title={extra.length > 0 ? `${t('dragToSeat')} (+${extra.length})` : t('dragToSeat')}
            >
              {peopleTool ? (
                <input type="checkbox" checked={inPicked} readOnly aria-label={g.name} />
              ) : (
                <span className="grip" aria-hidden>
                  <Icon name="grip" />
                </span>
              )}
              <span className="sl-name" dir="auto">
                {g.name}
              </span>
              {kindOf(planned(g, ids.length)) !== 'sure' && (
                <span className={`exp-tag small ${kindOf(planned(g, ids.length))}`}>
                  {t(kindOf(planned(g, ids.length)) === 'maybe' ? 'expMaybe' : 'expCourt')}
                </span>
              )}
              {extra.length > 0 && (
                <span className="gcount" title={extra.map((m) => m.name).join(', ')}>
                  +{extra.length}
                </span>
              )}
              <span className="sl-meta" dir="auto">
                {g.tableId ? `${label.get(g.tableId) ?? ''}${g.seat !== null ? ` #${g.seat + 1}` : ''}` : g.group}
              </span>
              {onEdit && (
                <button
                  className="sl-edit"
                  aria-label={t('editPerson')}
                  title={t('editPerson')}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    onEdit(g.id, r.left + r.width / 2, r.bottom);
                  }}
                >
                  <Icon name="edit" size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {rows.length > SHOWN && (
        <p className="muted">
          +{rows.length - SHOWN} {t('moreGuests')}
        </p>
      )}
    </>
  );
}
