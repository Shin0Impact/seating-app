import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import LangToggle from '@/components/LangToggle';
import SiteSettings from '@/components/SiteSettings';
import { getS } from '@/lib/lang-server';
import { localeOf } from '@/lib/site-i18n';
import { Logo } from '@/components/Site';
import MoreRequest from '@/components/MoreRequest';
import ChangeRequestButton from '@/components/ChangeRequestButton';
import HallPreview from '@/components/HallPreview';
import { parseLayout, type Guest } from '@/lib/layout';
import { buildFocus } from '@/lib/route';
import { isToken } from '@/lib/invites';
import { serverClient } from '@/lib/supabase/server';

export const metadata = { title: 'طاولتنا · Our Table', robots: { index: false, follow: false } };

async function answer(form: FormData) {
  'use server';
  const token = String(form.get('token') ?? '');
  if (!isToken(token)) return;
  const raw = form.get('status');
  const status = raw === 'declined' ? 'declined' : raw === 'pending' ? 'pending' : 'confirmed';
  const count = Number.parseInt(String(form.get('count') ?? '1'), 10);
  const supabase = await serverClient();
  await supabase.rpc('rsvp_set', { p_token: token, p_status: status, p_count: Number.isFinite(count) ? count : 1 });
  redirect(`/r/${token}`);
}

async function askMore(form: FormData) {
  'use server';
  const token = String(form.get('token') ?? '');
  if (!isToken(token)) return;
  const n = Number.parseInt(String(form.get('extra') ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) redirect(`/r/${token}`);
  const supabase = await serverClient();
  await supabase.rpc('rsvp_request_more', { p_token: token, p_extra: Math.min(n, 20) });
  redirect(`/r/${token}?more=1`);
}

export default async function Rsvp({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ more?: string }> }) {
  const { token } = await params;
  const q = await searchParams;
  if (!isToken(token)) notFound();
  const { lang, s } = await getS();
  const supabase = await serverClient();
  const { data } = await supabase.rpc('rsvp_get', { p_token: token });
  const inv = Array.isArray(data) ? data[0] : null;
  if (!inv) notFound();

  const h = await headers();
  const site = (process.env.NEXT_PUBLIC_SITE_URL || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`).replace(/\/$/, '');
  const qr = inv.status === 'confirmed' ? await QRCode.toString(`${site}/r/${token}`, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : '';
  // Confirmed families also see where their table is, with a walking line from the entrance.
  let focus: ReturnType<typeof buildFocus> = null;
  let planLayout: ReturnType<typeof parseLayout> | null = null;
  if (inv.status === 'confirmed') {
    const { data: map } = await supabase.rpc('rsvp_map', { p_token: token });
    if (map && typeof map === 'object') {
      const m = map as { settings: unknown; elements: unknown; placements: { id: string; tableId: string | null; seat: number | null }[] };
      const guests: Guest[] = (m.placements ?? []).map((p) => ({ id: p.id, name: '-', group: '', tableId: p.tableId, seat: p.seat, stepFree: false }));
      planLayout = parseLayout({ version: 1, settings: m.settings, elements: m.elements, guests });
      focus = buildFocus(planLayout, guests.map((g) => g.id));
    }
  }
  const when = inv.event_date ? new Date(inv.event_date + 'T00:00:00').toLocaleDateString(localeOf(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return (
    <div className="site rsvp-wrap">
      <div className="theme-float"><LangToggle /><SiteSettings /></div>
      <main className="rsvp-card">
        <div style={{ display: 'grid', placeItems: 'center' }}><Logo size={56} /></div>
        <p className="muted" style={{ margin: 0 }}>{inv.event_name}{when ? ` · ${when}` : ''}</p>
        <h1>{s('hello', { name: inv.guest_name })}</h1>
        {inv.status === 'pending' && (
          <form action={answer} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input type="hidden" name="token" value={token} />
            <p style={{ margin: 0 }}>{s('willYouCome', { event: inv.event_name })}</p>
            {inv.party_size > 1 && (
              <label className="field-col" style={{ alignItems: 'center' }}>{s('howManyUpTo', { n: inv.party_size })}
                <input name="count" type="number" min={1} max={inv.party_size} defaultValue={inv.party_size} inputMode="numeric" />
              </label>
            )}
            <div className="row">
              <button name="status" value="confirmed" className="btn primary">{s('yesWeCome')}</button>
              <button name="status" value="declined" className="btn">{s('noWeDecline')}</button>
            </div>
          </form>
        )}
        {inv.status === 'confirmed' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="notice ok" style={{ margin: 0 }}>{s('rsvpConfirmed', { n: inv.confirmed_count })}</p>
            <p style={{ margin: 0 }}>{s('showCode')}</p>
            <div className="qr" role="img" aria-label={s('entryCode')} dangerouslySetInnerHTML={{ __html: qr }} />
            {focus && planLayout && (
              <div className="where-map">
                <h2 style={{ fontSize: '1.05em', margin: '0 0 4px' }}>{s('yourTable')}: {focus.seat ? s('tableSeat', { table: focus.table, n: focus.seat }) : s('tableOnly', { table: focus.table })}</h2>
                <HallPreview layout={planLayout} label={s('yourTable')} focus={focus} />
              </div>
            )}
            <MoreRequest action={askMore} token={token} sent={q.more === '1'} total={inv.party_size} />
            <ChangeRequestButton action={answer} token={token} />
          </section>
        )}
        {inv.status === 'declined' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0 }}>{s('declinedNote')}</p>
            <ChangeRequestButton action={answer} token={token} />
          </section>
        )}
      </main>
    </div>
  );
}
