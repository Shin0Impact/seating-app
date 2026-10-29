import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/Site';
import SubmitButton from '@/components/SubmitButton';
import { getS } from '@/lib/lang-server';
import { localeOf } from '@/lib/site-i18n';
import { serverClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

async function restore(form: FormData) {
  'use server';
  const id = String(form.get('id') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect('/events/backups');
  const supabase = await serverClient();
  const { data, error } = await supabase.rpc('restore_backup', { p_id: id });
  if (error || !data) redirect('/events/backups?error=1');
  redirect(`/events/${data}`);
}

export async function generateMetadata() {
  const { s } = await getS();
  return { title: `${s('backups')} · ${s('brand')}` };
}

export default async function Backups({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!supabaseConfigured) redirect('/');
  const q = await searchParams;
  const { lang, s } = await getS();
  const supabase = await serverClient();
  const [{ data: rows, error }, { data: live }] = await Promise.all([
    supabase
      .from('event_backups')
      .select('id,event_id,name,reason,taken_at')
      .order('taken_at', { ascending: false })
      .limit(300),
    supabase.from('events').select('id'),
  ]);
  const alive = new Set((live ?? []).map((e) => e.id));
  const when = (t: string) =>
    new Date(t).toLocaleString(localeOf(lang), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const byEvent = new Map<string, NonNullable<typeof rows>>();
  for (const r of rows ?? []) byEvent.set(r.event_id, [...(byEvent.get(r.event_id) ?? []), r]);
  return (
    <div className="site">
      <SiteHeader />
      <main className="container">
        <div className="page-title">
          <h1>{s('backups')}</h1>
          <Link className="btn small" href="/events">
            {s('allEvents')}
          </Link>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {s('backupsHint')}
        </p>
        {q.error && (
          <p className="notice err" role="alert">
            {s('restoreFailed')}
          </p>
        )}
        {error && (
          <p className="notice err" role="alert">
            {s('backupsMissing')}
          </p>
        )}
        {!error && byEvent.size === 0 && <p className="empty">{s('noBackups')}</p>}
        {[...byEvent.entries()].map(([eventId, list]) => (
          <section key={eventId} className="card-box">
            <h2>
              {list[0].name} {!alive.has(eventId) && <span className="tag">{s('deletedTag')}</span>}
            </h2>
            <ul className="inv-list">
              {list.map((b) => (
                <li key={b.id} className="inv">
                  <div className="inv-main">
                    <span>{when(b.taken_at)}</span>{' '}
                    <span className="muted">{b.reason === 'deleted' ? s('beforeDelete') : s('dailyBackup')}</span>
                  </div>
                  <form action={restore} className="inv-actions">
                    <input type="hidden" name="id" value={b.id} />
                    <SubmitButton className="btn small">{s('restore')}</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}
