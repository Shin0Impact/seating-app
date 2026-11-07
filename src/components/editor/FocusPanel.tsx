'use client';

import { useMemo, useState } from 'react';

const ORDER_KEY = 'focus-order';
import type { Guest, TableEl } from '@/lib/layout';
import type { Key } from '@/lib/i18n';
import { Icon } from '../Icon';

/** One table in focus: who sits on it, chair by chair, and who is waiting for a chair there. */
export function FocusPanel({
  t,
  table,
  guests,
  onClose,
  onOpenChair,
  onRemoveGuest,
  onMenu,
}: {
  t: (k: Key) => string;
  table: TableEl;
  guests: Guest[];
  onClose: () => void;
  /** Open the chair menu (change / empty) for this chair. */
  onOpenChair: (seat: number, x: number, y: number) => void;
  onRemoveGuest: (id: string) => void;
  onMenu?: (id: string, x: number, y: number) => void;
}) {
  /** Chair order (with the free chairs), or the people by name; remembered on this device. */
  const [order, setOrderState] = useState<'chair' | 'name'>(() => {
    try {
      return localStorage.getItem(ORDER_KEY) === 'name' ? 'name' : 'chair';
    } catch {
      return 'chair';
    }
  });
  const setOrder = (o: 'chair' | 'name') => {
    setOrderState(o);
    try {
      localStorage.setItem(ORDER_KEY, o);
    } catch {
      /* private mode */
    }
  };
  const { chairs, waiting, count } = useMemo(() => {
    const at = guests.filter((g) => g.tableId === table.id);
    const bySeat = new Map(at.filter((g) => g.seat !== null).map((g) => [g.seat as number, g]));
    const all = Array.from({ length: table.seats }, (_, i) => ({ seat: i, g: bySeat.get(i) }));
    return {
      chairs:
        order === 'chair'
          ? all
          : all.filter((c) => c.g).sort((a, b) => a.g!.name.localeCompare(b.g!.name, ['ar', 'he', 'en'])),
      waiting: at.filter((g) => g.seat === null),
      count: at.length,
    };
  }, [guests, table, order]);

  return (
    <aside className="focus-panel" aria-label={table.label}>
      <header>
        <div>
          <h2 dir="auto">{table.label}</h2>
          <p className={`muted${count > table.seats ? ' over' : ''}`}>
            {count}/{table.seats} {t('chairs')}
          </p>
        </div>
        <button className="btn small" onClick={onClose} aria-label={t('close')}>
          ✕
        </button>
      </header>
      <div className="seg focus-order" role="group" aria-label={t('sortBy')}>
        <button
          type="button"
          className={order === 'chair' ? 'on' : ''}
          aria-pressed={order === 'chair'}
          onClick={() => setOrder('chair')}
        >
          {t('byChair')}
        </button>
        <button
          type="button"
          className={order === 'name' ? 'on' : ''}
          aria-pressed={order === 'name'}
          onClick={() => setOrder('name')}
        >
          {t('byName')}
        </button>
      </div>
      <ol className="focus-list">
        {chairs.map(({ seat, g }) => (
          <li
            key={seat}
            className={g ? '' : 'free'}
            onContextMenu={(e) => {
              if (!g || !onMenu) return;
              e.preventDefault();
              onMenu(g.id, e.clientX, e.clientY);
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onOpenChair(seat, r.left, r.bottom);
              }}
            >
              <span className="num">{seat + 1}</span>
              <span className="nm" dir="auto">
                {g ? g.name : t('freeChair')}
              </span>
            </button>
            {g && (
              <button
                type="button"
                className="del"
                aria-label={`${t('removeGuest')} (${g.name})`}
                title={t('removeGuest')}
                onClick={() => onRemoveGuest(g.id)}
              >
                <Icon name="trash" size={16} />
              </button>
            )}
          </li>
        ))}
      </ol>
      {waiting.length > 0 && (
        <>
          <p className="muted over">
            {t('waitingChair')} ({waiting.length})
          </p>
          <ul className="focus-list">
            {waiting.map((g) => (
              <li
                key={g.id}
                onContextMenu={(e) => {
                  if (!onMenu) return;
                  e.preventDefault();
                  onMenu(g.id, e.clientX, e.clientY);
                }}
              >
                <span className="num">–</span>
                <span className="nm" dir="auto">
                  {g.name}
                </span>
                <button
                  type="button"
                  className="del"
                  aria-label={`${t('removeGuest')} (${g.name})`}
                  title={t('removeGuest')}
                  onClick={() => onRemoveGuest(g.id)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
