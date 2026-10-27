import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/Site';
import { emptyLayout } from '@/lib/layout';
import { signOut } from '@/app/actions';
import { serverClient } from '@/lib/supabase/server';
import { supabaseConfigured } from '@/lib/supabase/env';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'مناسباتي' };

async function create(form: FormData) {
  'use server';
  const name = String(form.get('name') ?? '').trim().slice(0, 120);
  const date = String(form.get('date') ?? '');
  if (!name) redirect('/events?error=1');
  const supabase = await serverClient();
  const { data, error } = await supabase
    .from('events')
    .insert({ name, event_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, layout: emptyLayout() })
    .select('id')
    .single();
  if (error || !data) redirect('/events?error=1');
  redirect(`/events/${data.id}`);
}


const fmtDate = (d: string | null) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' }) : 'بدون تاريخ');

export default async function Events({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string }> }) {
  if (!supabaseConfigured) redirect('/');
  const q = await searchParams;
  const supabase = await serverClient();
  const { data: events } = await supabase.from('events').select('id,name,event_date,updated_at').order('updated_at', { ascending: false });
  const ids = (events ?? []).map((e) => e.id);
  const { data: inv } = ids.length ? await supabase.from('invites').select('event_id,status,sent_at,party_size') : { data: [] };
  const stat = new Map<string, { families: number; sent: number; yes: number }>();
  for (const r of inv ?? []) {
    const s = stat.get(r.event_id) ?? { families: 0, sent: 0, yes: 0 };
    s.families++;
    if (r.sent_at || r.status !== 'pending') s.sent++;
    if (r.status === 'confirmed') s.yes++;
    stat.set(r.event_id, s);
  }
  return (
    <div className="site">
      <SiteHeader>
        <form action={signOut}><button className="btn small">تسجيل الخروج</button></form>
      </SiteHeader>
      <main className="container">
        <div className="page-title"><h1>مناسباتي</h1></div>
        {q.deleted && <p className="notice ok" role="status">تم حذف المناسبة.</p>}
        {q.error && <p className="notice err" role="alert">تعذّر إنشاء المناسبة. حاول مرة أخرى.</p>}
        <div className="event-grid">
          {(events ?? []).map((e) => {
            const s = stat.get(e.id);
            return (
              <Link key={e.id} href={`/events/${e.id}`} className="event-card">
                <h3>{e.name}</h3>
                <div className="event-meta">
                  <span>{fmtDate(e.event_date)}</span>
                  {s ? <span>{s.families} عائلة · أُرسلت {s.sent} · أكّدت {s.yes}</span> : <span>لا دعوات بعد</span>}
                </div>
              </Link>
            );
          })}
          {(events ?? []).length === 0 && <p className="muted">لا توجد مناسبات بعد. أنشئ أول مناسبة من النموذج أدناه.</p>}
        </div>
        <form action={create} className="card-box">
          <h2>مناسبة جديدة</h2>
          <label className="field-col">الاسم<input name="name" required maxLength={120} placeholder="مثال: زفاف فضل" /></label>
          <label className="field-col">التاريخ (اختياري)<input name="date" type="date" /></label>
          <button className="btn primary">إنشاء والمتابعة</button>
        </form>
      </main>
    </div>
  );
}
