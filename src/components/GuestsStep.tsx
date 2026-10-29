'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STRINGS } from '@/lib/i18n';
import { useLang, useS } from './LangProvider';
import { GuestsView } from './GuestsView';
import { Guest, Layout, TableEl, placeNewTables } from '@/lib/layout';
import { browserClient } from '@/lib/supabase/browser';

type Status = 'saved' | 'saving' | 'error' | 'conflict';

/** The guests step: the same guest list as the hall editor (add, edit, seat, import), saved into the event with the same version check. */
export default function GuestsStep({ id, initial, version }: { id: string; initial: Layout; version: number }) {
  const router = useRouter();
  const { lang } = useLang();
  const s = useS();
  const t = useCallback((k: keyof typeof STRINGS.ar) => STRINGS[lang][k], [lang]);
  const [layout, setLayout] = useState(initial);
  const [status, setStatus] = useState<Status>('saved');
  const ver = useRef(version);
  const pending = useRef<Layout | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    if (busy.current || !pending.current) return;
    const next = pending.current;
    pending.current = null;
    busy.current = true;
    setStatus('saving');
    const { data, error } = await browserClient()
      .from('events')
      .update({ layout: next, version: ver.current + 1, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('version', ver.current)
      .select('version');
    busy.current = false;
    if (error) return setStatus('error');
    if (!data || data.length === 0) return setStatus('conflict');
    ver.current = data[0].version;
    setStatus(pending.current ? 'saving' : 'saved');
    if (pending.current) void flush();
  }, [id]);

  const commit = useCallback((next: Layout) => {
    setLayout(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  }, [flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (pending.current || busy.current) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const tables = layout.elements.filter((e): e is TableEl => e.kind === 'table');
  const label = { saved: s('saved'), saving: s('saving'), error: s('saveError'), conflict: s('saveConflict') }[status];

  return (
    <div className="guests-step">
      <p className={`save-status ${status}`} role="status" style={{ margin: 0 }}>{label}</p>
      <GuestsView
        t={t}
        guests={layout.guests}
        tables={tables}
        onChange={(guests: Guest[]) => commit({ ...layoutRef.current, guests })}
        onImportAll={(added, made) => {
          const l = layoutRef.current;
          commit({ ...l, elements: [...l.elements, ...placeNewTables(l.elements, l.settings, made)], guests: [...l.guests, ...added] });
        }}
        onLocate={(g) => {
          void flush().then(() => router.push(`/events/${id}/hall?focus=${g.id}`));
        }}
      />
    </div>
  );
}
