import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/Site';
import { emptyLayout } from '@/lib/layout';
import { serverClient } from '@/lib/supabase/server';
import { getS } from '@/lib/lang-server';
import { localeOf } from '@/lib/site-i18n';
import { supabaseConfigured } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

async function create(form: FormData) {
  'use server';
  const name = String(form.get('name') ?? '')
    .trim()
    .slice(0, 120);
  const date = String(form.get('date') ?? '');
  if (!name) redirect('/events?error=1&new=1');
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from('events')
    .insert({ name, event_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, layout: emptyLayout() })
    .select('id')
    .single();
  if (error || !data) redirect('/events?error=1');
  redirect(`/events/${data.id}`);
}

export async function generateMetadata() {
  const { s } = await getS();
  return { title: `${s('titleEvents')} · ${s('brand')}` };
}

export default async function Events({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; deleted?: string; new?: string }>;
}) {
  if (!supabaseConfigured) redirect('/');
  const q = await searchParams;
  const { lang, s } = await getS();
  const supabase = await serverClient();
  const [{ data: events }, { data: inv }] = await Promise.all([
    supabase.from('events').select('id,name,event_date,updated_at').order('updated_at', { ascending: false }),
    supabase.from('invites').select('event_id,status,sent_at,party_size'),
  ]);
  const stat = new Map<string, { families: number; sent: number; yes: number }>();
  for (const r of inv ?? []) {
    const st = stat.get(r.event_id) ?? { families: 0, sent: 0, yes: 0 };
    st.families++;
    if (r.sent_at || r.status !== 'pending') st.sent++;
    if (r.status === 'confirmed') st.yes++;
    stat.set(r.event_id, st);
  }
  const fmtDate = (d: string | null) =>
    d
      ? new Date(d + 'T00:00:00').toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'long', year: 'numeric' })
      : s('noDate');
  const list = events ?? [];
  const showForm = !!q.new;
  const plus = <span aria-hidden>+</span>;
  return (
    <div className="site">
      <SiteHeader>
        {list.length > 0 && !showForm && (
          <Link className="btn small" href="/events?new=1">
            {plus} {s('newEvent')}
          </Link>
        )}
      </SiteHeader>
      <main className="container">
        <div className="page-title">
          <h1>{s('myEvents')}</h1>
        </div>
        {q.deleted && (
          <p className="notice ok" role="status">
            {s('eventDeleted')}
          </p>
        )}
        {q.error && (
          <p className="notice err" role="alert">
            {s('createFailed')}
          </p>
        )}
        {showForm && (
          <form action={create} className="card-box">
            <h2>{s('newEvent')}</h2>
            <label className="field-col">
              {s('name')}
              <input name="name" required maxLength={120} placeholder={s('namePlaceholder')} autoFocus />
            </label>
            <label className="field-col">
              {s('dateOptional')}
              <input name="date" type="date" />
            </label>
            <div className="row" style={{ display: 'flex', gap: 10 }}>
              <button className="btn">{s('createContinue')}</button>
              <Link className="btn" href="/events">
                {s('cancel')}
              </Link>
            </div>
          </form>
        )}
        <div className="event-grid">
          {list.map((e) => {
            const st = stat.get(e.id);
            return (
              <Link key={e.id} href={`/events/${e.id}`} className="event-card">
                <h3>{e.name}</h3>
                <div className="event-meta">
                  <span>{fmtDate(e.event_date)}</span>
                  {st ? (
                    <span>{s('familiesLine', { n: st.families, sent: st.sent, yes: st.yes })}</span>
                  ) : (
                    <span>{s('noInvitesYet')}</span>
                  )}
                </div>
              </Link>
            );
          })}
          {list.length === 0 && !showForm && (
            <Link href="/events?new=1" className="event-card new-card" aria-label={s('newEvent')}>
              <span className="plus" aria-hidden>
                +
              </span>
              <span>{s('newEvent')}</span>
            </Link>
          )}
        </div>
        <p style={{ margin: 0 }}>
          <Link href="/events/backups" className="muted">
            {s('backups')}
          </Link>
        </p>
      </main>
    </div>
  );
}
