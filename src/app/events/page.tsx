import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SiteHeader } from '@/components/Site';
import { emptyLayout } from '@/lib/layout';
import { changePassword, setUsername } from '@/app/actions';
import { serverClient, whoAmI } from '@/lib/supabase/server';
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

export default async function Events({ searchParams }: { searchParams: Promise<{ error?: string; deleted?: string; username?: string; password?: string }> }) {
  if (!supabaseConfigured) redirect('/');
  const q = await searchParams;
  const supabase = await serverClient();
  const me = await whoAmI(supabase);
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
      <SiteHeader />
      <main className="container">
        <div className="page-title"><h1>مناسباتي</h1></div>
        {q.username && (
          <p className={`notice ${q.username === 'saved' ? 'ok' : 'err'}`} role="status">
            {{ saved: 'تم حفظ اسم المستخدم.', taken: 'اسم المستخدم هذا مستخدم من قبل.', invalid: 'اسم المستخدم من 2 إلى 30 حرفًا بدون مسافات أو @.' }[q.username] ?? 'تعذّر حفظ اسم المستخدم.'}
          </p>
        )}
        {q.password && (
          <p className={`notice ${q.password === 'saved' ? 'ok' : 'err'}`} role="status">
            {{ saved: 'تم تغيير كلمة المرور.', wrong: 'كلمة المرور الحالية غير صحيحة.', short: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.', mismatch: 'كلمتا المرور الجديدتان غير متطابقتين.' }[q.password] ?? 'تعذّر تغيير كلمة المرور.'}
          </p>
        )}
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
          <label className="field-col">الاسم<input name="name" required maxLength={120} placeholder="مثال: حفل زفاف" /></label>
          <label className="field-col">التاريخ (اختياري)<input name="date" type="date" /></label>
          <button className="btn primary">إنشاء والمتابعة</button>
        </form>
        <form action={setUsername} className="card-box">
          <h2>اسم المستخدم</h2>
          <p className="muted" style={{ margin: 0 }}>{me.username ? 'يمكنك الدخول به بدل البريد الإلكتروني.' : 'اختر اسمًا لتدخل به بدل البريد الإلكتروني.'}</p>
          <label className="field-col">الاسم<input name="username" defaultValue={me.username ?? ''} required minLength={2} maxLength={30} autoCapitalize="none" autoComplete="off" dir="ltr" placeholder="jihad" /></label>
          <button className="btn">{me.username ? 'تغيير الاسم' : 'حفظ الاسم'}</button>
        </form>
        <form action={changePassword} className="card-box">
          <h2>تغيير كلمة المرور</h2>
          <label className="field-col">كلمة المرور الحالية<input name="current" type="password" required autoComplete="current-password" dir="ltr" /></label>
          <label className="field-col">كلمة المرور الجديدة (8 أحرف على الأقل)<input name="next" type="password" required minLength={8} autoComplete="new-password" dir="ltr" /></label>
          <label className="field-col">أعد كتابة الجديدة<input name="again" type="password" required minLength={8} autoComplete="new-password" dir="ltr" /></label>
          <button className="btn">تغيير كلمة المرور</button>
        </form>
      </main>
    </div>
  );
}
