'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Layout } from '@/lib/layout';
import { signOut } from '@/app/actions';
import { useLayoutSync } from './useLayoutSync';
import { useS } from './LangProvider';

const Editor = dynamic(() => import('./Editor'), { ssr: false, loading: () => <p style={{ padding: 24 }}>…</p> });

/** The hall editor backed by the database: saved a moment after you stop, and kept in step with other devices editing the same event. */
export default function EventEditor({
  id,
  name,
  initial,
  version,
  focusGuest,
}: {
  id: string;
  name: string;
  initial: Layout;
  version: number;
  user?: string;
  focusGuest?: string;
}) {
  const s = useS();
  const { status, incoming, onChange, shown } = useLayoutSync(id, initial, version);

  const label = { saved: s('saved'), saving: s('saving'), error: s('saveError'), merged: s('syncedOther') }[status];
  return (
    <Editor
      initial={initial}
      focusGuest={focusGuest}
      onChange={onChange}
      incoming={incoming}
      onShown={shown}
      account={{ eventId: id, signOut }}
      leading={
        <div className="event-lead">
          {/* always to this event's page (going "back" in history could land on the guest list, another event or
              an earlier view of the editor); anything not saved yet is saved on the way out */}
          <Link className="back-link" href={`/events/${id}`} aria-label={s('backToEventAria')}>
            {s('backToEvent')}
          </Link>
          <h1>{name}</h1>
          <span className={`save-status ${status}`} role="status">
            {label}
          </span>
        </div>
      }
    />
  );
}
