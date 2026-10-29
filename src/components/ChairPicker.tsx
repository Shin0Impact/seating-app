'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Guest, LIMITS, TableEl } from '@/lib/layout';
import { Key } from '@/lib/i18n';
import { matches } from '@/lib/search';

type Props = {
  t: (k: Key) => string;
  table: TableEl;
  seat: number;
  x: number;
  y: number;
  guests: Guest[];
  tableLabel: (id: string) => string;
  onPick: (guestId: string) => void;
  onAddAndSeat: (name: string) => void;
  onEmpty: (guestId: string) => void;
  onEdit: (guestId: string, patch: Partial<Guest>) => void;
  onRemoveGuest: (guestId: string) => void;
  onClose: () => void;
};

/** Popup opened by double-clicking a chair: choose which invited guest sits there. */
export function ChairPicker({
  t,
  table,
  seat,
  x,
  y,
  guests,
  tableLabel,
  onPick,
  onAddAndSeat,
  onEmpty,
  onEdit,
  onRemoveGuest,
  onClose,
}: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const occupant = guests.find((g) => g.tableId === table.id && g.seat === seat);
  const list = useMemo(() => {
    const f = guests.filter((g) => matches(query, g.name, g.group));
    // not yet seated first, then the rest
    return [...f.filter((g) => !g.tableId), ...f.filter((g) => g.tableId)].slice(0, 200);
  }, [guests, query]);

  const trimmed = query.trim();
  const exact = guests.some((g) => g.name.trim() === trimmed);
  const canAdd = trimmed !== '' && !exact && guests.length < LIMITS.maxGuests;

  const W = 300;
  const left = Math.max(8, Math.min(x + 12, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(y + 12, window.innerHeight - 520));

  return (
    <>
      <div className="picker-backdrop" onMouseDown={onClose} />
      <div
        className="picker"
        role="dialog"
        aria-label={t('seatAt')}
        style={{ left, top, width: W }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose();
        }}
      >
        <h3>
          {t('seatAt')} {seat + 1} · {table.label}
        </h3>
        {occupant && (
          <>
            <GuestFields t={t} guest={occupant} onEdit={onEdit} />
            <div className="picker-row">
              <button className="picker-empty" onClick={() => onEmpty(occupant.id)}>
                {t('emptyChair')}
              </button>
              <button className="picker-empty danger" onClick={() => onRemoveGuest(occupant.id)}>
                {t('removeGuest')}
              </button>
            </div>
            <h4>{t('changeGuest')}</h4>
          </>
        )}
        <input
          ref={inputRef}
          type="search"
          value={query}
          maxLength={LIMITS.nameMax}
          placeholder={t('pickSearch')}
          aria-label={t('pickSearch')}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (list.length === 1) onPick(list[0].id);
              else if (list.length === 0 && canAdd) onAddAndSeat(trimmed);
            }
          }}
        />
        <ul>
          {list.map((g) => (
            <li key={g.id}>
              <button className={g.id === occupant?.id ? 'here' : ''} onClick={() => onPick(g.id)}>
                <span className="pn">{g.name}</span>
                <span className="pm">
                  {g.group}
                  {g.tableId
                    ? `${g.group ? ' · ' : ''}${t('seatedAt')} ${tableLabel(g.tableId)}${g.seat !== null ? ` #${g.seat + 1}` : ''}`
                    : ''}
                </span>
              </button>
            </li>
          ))}
          {canAdd && (
            <li>
              <button className="add" onClick={() => onAddAndSeat(trimmed)}>
                + {t('addAndSeat')}: {trimmed}
              </button>
            </li>
          )}
          {list.length === 0 && !canAdd && <li className="muted">{t('noMatches')}</li>}
        </ul>
      </div>
    </>
  );
}

/** Name, group and access fields for one guest; edits apply as you type. */
export function GuestFields({
  t,
  guest,
  onEdit,
}: {
  t: (k: Key) => string;
  guest: Guest;
  onEdit: (id: string, patch: Partial<Guest>) => void;
}) {
  return (
    <div className="guest-fields">
      <label className="field">
        <span>{t('guestName')}</span>
        <input
          type="text"
          dir="auto"
          maxLength={LIMITS.nameMax}
          value={guest.name}
          onChange={(e) => onEdit(guest.id, { name: e.target.value })}
        />
      </label>
      <label className="field">
        <span>{t('guestGroup')}</span>
        <input
          type="text"
          dir="auto"
          maxLength={LIMITS.nameMax}
          value={guest.group}
          onChange={(e) => onEdit(guest.id, { group: e.target.value })}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={guest.stepFree}
          onChange={(e) => onEdit(guest.id, { stepFree: e.target.checked })}
        />
        <span>{t('stepFree')}</span>
      </label>
    </div>
  );
}

/** Popup to edit a guest who has no chair yet (opened from the side list). */
export function GuestEditPopup({
  t,
  guest,
  x,
  y,
  onEdit,
  onRemoveGuest,
  onClose,
}: {
  t: (k: Key) => string;
  guest: Guest;
  x: number;
  y: number;
  onEdit: (id: string, patch: Partial<Guest>) => void;
  onRemoveGuest: (id: string) => void;
  onClose: () => void;
}) {
  const W = 300;
  const left = Math.max(8, Math.min(x - W / 2, window.innerWidth - W - 8));
  const top = Math.max(8, Math.min(y + 8, window.innerHeight - 340));
  return (
    <>
      <div className="picker-backdrop" onMouseDown={onClose} />
      <div
        className="picker"
        role="dialog"
        aria-label={t('editPerson')}
        style={{ left, top, width: W }}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <h3>{t('editPerson')}</h3>
        <GuestFields t={t} guest={guest} onEdit={onEdit} />
        <div className="picker-row">
          <button className="primary" onClick={onClose}>
            {t('done')}
          </button>
          <button
            className="picker-empty danger"
            onClick={() => {
              onRemoveGuest(guest.id);
              onClose();
            }}
          >
            {t('removeGuest')}
          </button>
        </div>
      </div>
    </>
  );
}
