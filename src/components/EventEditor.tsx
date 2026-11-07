'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const { status, incoming, onChange } = useLayoutSync(id, initial, version);

  const label = { saved: s('saved'), saving: s('saving'), error: s('saveError'), merged: s('syncedOther') }[status];
  return (
    <Editor
      initial={initial}
      focusGuest={focusGuest}
      onChange={onChange}
      incoming={incoming}
      account={{ eventId: id, signOut }}
      leading={
        <div className="event-lead">
          <button
            type="button"
            className="back-link"
            aria-label={s('backToEventAria')}
            onClick={() => (window.history.length > 1 ? router.back() : router.push(`/events/${id}`))}
          >
            {s('backToEvent')}
          </button>
          <h1>{name}</h1>
          <span className={`save-status ${status}`} role="status">
            {label}
          </span>
        </div>
      }
    />
  );
}
