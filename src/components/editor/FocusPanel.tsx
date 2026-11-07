'use client';

import { useMemo } from 'react';
import type { Guest, TableEl } from '@/lib/layout';
import type { Key } from '@/lib/i18n';

/** One table in focus: who sits on it, chair by chair, and who is waiting for a chair there. */
export function FocusPanel({
  t,
  table,
  guests,
  onClose,
  onOpenChair,
}: {
  t: (k: Key) => string;
  table: TableEl;
  guests: Guest[];
  onClose: () => void;
  /** Open the chair menu (change / empty) for this chair. */
  onOpenChair: (seat: number, x: number, y: number) => void;
}) {
  const { chairs, waiting, count } = useMemo(() => {
    const at = guests.filter((g) => g.tableId === table.id);
    const bySeat = new Map(at.filter((g) => g.seat !== null).map((g) => [g.seat as number, g]));
    return {
      chairs: Array.from({ length: table.seats }, (_, i) => ({ seat: i, g: bySeat.get(i) })),
      waiting: at.filter((g) => g.seat === null),
      count: at.length,
    };
  }, [guests, table]);

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
      <ol className="focus-list">
        {chairs.map(({ seat, g }) => (
          <li key={seat} className={g ? '' : 'free'}>
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
              <li key={g.id}>
                <span className="num">–</span>
                <span className="nm" dir="auto">
                  {g.name}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
