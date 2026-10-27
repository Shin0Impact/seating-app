import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import { isToken } from '@/lib/invites';
import { serverClient } from '@/lib/supabase/server';

export const metadata = { title: 'دعوة', robots: { index: false, follow: false } };

async function answer(form: FormData) {
  'use server';
  const token = String(form.get('token') ?? '');
  if (!isToken(token)) return;
  const status = form.get('status') === 'declined' ? 'declined' : 'confirmed';
  const count = Number.parseInt(String(form.get('count') ?? '1'), 10);
  const supabase = await serverClient();
  await supabase.rpc('rsvp_set', { p_token: token, p_status: status, p_count: Number.isFinite(count) ? count : 1 });
  redirect(`/r/${token}`);
}

export default async function Rsvp({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isToken(token)) notFound();
  const supabase = await serverClient();
  const { data } = await supabase.rpc('rsvp_get', { p_token: token });
  const inv = Array.isArray(data) ? data[0] : null;
  if (!inv) notFound();

  const h = await headers();
  const site = (process.env.NEXT_PUBLIC_SITE_URL || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`).replace(/\/$/, '');
  const qr = inv.status === 'confirmed' ? await QRCode.toString(`${site}/r/${token}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : '';

  return (
    <main className="page narrow rsvp">
      <p className="muted">{inv.event_name}{inv.event_date ? ` · ${inv.event_date}` : ''}</p>
      <h1>أهلًا {inv.guest_name}</h1>
      {inv.status === 'pending' && (
        <form action={answer} className="stack">
          <input type="hidden" name="token" value={token} />
          <p>هل ستحضرون؟</p>
          {inv.party_size > 1 && (
            <label>كم شخصًا سيحضر (حتى {inv.party_size})؟
              <input name="count" type="number" min={1} max={inv.party_size} defaultValue={inv.party_size} inputMode="numeric" />
            </label>
          )}
          <div className="row">
            <button name="status" value="confirmed" className="primary">نعم، سنحضر</button>
            <button name="status" value="declined">نعتذر</button>
          </div>
        </form>
      )}
      {inv.status === 'confirmed' && (
        <section className="stack">
          <p>تم تأكيد حضوركم ({inv.confirmed_count}). أبرزوا هذا الرمز عند المدخل وسنرافقكم إلى طاولتكم.</p>
          <div className="qr" role="img" aria-label="QR" dangerouslySetInnerHTML={{ __html: qr }} />
          <form action={answer}>
            <input type="hidden" name="token" value={token} />
            <button name="status" value="declined" className="link">تغيير: لن نتمكن من الحضور</button>
          </form>
        </section>
      )}
      {inv.status === 'declined' && (
        <form action={answer} className="stack">
          <input type="hidden" name="token" value={token} />
          <p>سُجّل اعتذاركم. شكرًا لإعلامنا.</p>
          <button name="status" value="confirmed">غيّرت رأيي، سنحضر</button>
        </form>
      )}
    </main>
  );
}
