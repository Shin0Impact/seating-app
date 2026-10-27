'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Layout } from '@/lib/layout';
import { signOut } from '@/app/actions';
import { browserClient } from '@/lib/supabase/browser';

const Editor = dynamic(() => import('./Editor'), { ssr: false, loading: () => <p style={{ padding: 24 }}>…</p> });

type Status = 'saved' | 'saving' | 'error' | 'conflict';

/** The hall editor backed by the database: changes are saved a moment after you stop, and a stale tab cannot overwrite a newer save. */
export default function EventEditor({ id, name, initial, version, user }: { id: string; name: string; initial: Layout; version: number; user: string }) {
  const [status, setStatus] = useState<Status>('saved');
  const ver = useRef(version);
  const last = useRef(JSON.stringify(initial));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Layout | null>(null);
  const busy = useRef(false);

  const flush = useCallback(async () => {
    if (busy.current || !pending.current) return;
    const layout = pending.current;
    pending.current = null;
    busy.current = true;
    setStatus('saving');
    const { data, error } = await browserClient()
      .from('events')
      .update({ layout, version: ver.current + 1, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('version', ver.current)
      .select('version');
    busy.current = false;
    if (error) return setStatus('error');
    if (!data || data.length === 0) return setStatus('conflict'); // someone saved a newer version
    ver.current = data[0].version;
    last.current = JSON.stringify(layout);
    setStatus(pending.current ? 'saving' : 'saved');
    if (pending.current) void flush();
  }, [id]);

  const onChange = useCallback(
    (layout: Layout) => {
      const s = JSON.stringify(layout);
      if (s === last.current) return;
      pending.current = layout;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 800);
    },
    [flush],
  );

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current || busy.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const label = { saved: 'تم الحفظ', saving: 'جارٍ الحفظ…', error: 'تعذّر الحفظ — سنحاول مجددًا عند التعديل', conflict: 'تم تعديل المخطط من نافذة أخرى. أعد تحميل الصفحة.' }[status];
  return (
    <Editor
      initial={initial}
      onChange={onChange}
      account={{ user, eventId: id, signOut }}
      leading={
        <div className="event-lead">
          <Link href="/events" className="back-link" aria-label="مناسباتي">→ مناسباتي</Link>
          <h1>{name}</h1>
          <span className={`save-status ${status}`} role="status">{label}</span>
        </div>
      }
    />
  );
}
