import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import '@fontsource/amiri/arabic-400.css';
import '@fontsource/amiri/arabic-700.css';
import LangToggle from '@/components/LangToggle';
import SiteSettings from '@/components/SiteSettings';
import { getS } from '@/lib/lang-server';
import { localeOf } from '@/lib/site-i18n';
import { Logo } from '@/components/Site';
import GuestCount from '@/components/GuestCount';
import ZoomPan from '@/components/ZoomPan';
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
  const n = Number.isFinite(count) ? Math.min(Math.max(count, 1), 70) : 1;
  await supabase.rpc('rsvp_set', { p_token: token, p_status: status, p_count: n });
  // more people than the invitation: the extras wait for the host's approval (the function ignores a count that matches)
  if (status === 'confirmed') await supabase.rpc('rsvp_change_count', { p_token: token, p_count: n });
  redirect(`/r/${token}`);
}

async function changeCount(form: FormData) {
  'use server';
  const token = String(form.get('token') ?? '');
  if (!isToken(token)) return;
  const n = Number.parseInt(String(form.get('count') ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) redirect(`/r/${token}`);
  const supabase = await serverClient();
  await supabase.rpc('rsvp_change_count', { p_token: token, p_count: Math.min(n, 70) });
  redirect(`/r/${token}?saved=1`);
}

export default async function Rsvp({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ saved?: string }> }) {
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
  const loc = localeOf(lang);
  const d = inv.event_date ? new Date(inv.event_date + 'T00:00:00') : null;
  const dayNum = d ? d.getDate() : null;
  const monthName = d ? d.toLocaleDateString(loc, { month: 'long' }) : '';
  const weekday = d ? d.toLocaleDateString(loc, { weekday: 'long' }) : '';
  const yearNum = d ? d.getFullYear() : null;
  const daysLeft = d ? Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())) / 86400000) : null;
  const countdown =
    daysLeft === null || daysLeft < 0 ? '' :
    daysLeft === 0 ? s('eventToday') :
    lang === 'en' ? (daysLeft === 1 ? 'Tomorrow' : `${daysLeft} days to go`) :
    daysLeft === 1 ? 'باقي يوم واحد' : daysLeft === 2 ? 'باقي يومان' : daysLeft <= 10 ? `باقي ${daysLeft} أيام` : `باقي ${daysLeft} يومًا`;
  // "add to calendar": a small .ics file; floating local time, or an all-day entry when no time is set
  let ics = '';
  if (d) {
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const t = /^(\d{2}):(\d{2})$/.exec(inv.event_time ?? '');
    const esc = (v: string) => v.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\r?\n/g, ' ');
    const end = new Date(d.getTime() + 86400000);
    const endYmd = `${end.getFullYear()}${String(end.getMonth() + 1).padStart(2, '0')}${String(end.getDate()).padStart(2, '0')}`;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Our Table//EN', 'BEGIN:VEVENT', `UID:${token}@our-table`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      t ? `DTSTART:${ymd}T${t[1]}${t[2]}00` : `DTSTART;VALUE=DATE:${ymd}`,
      t ? `DTEND:${ymd}T${String(Math.min(23, Number(t[1]) + 4)).padStart(2, '0')}${t[2]}00` : `DTEND;VALUE=DATE:${endYmd}`,
      `SUMMARY:${esc(inv.event_name)}`, ...(inv.venue ? [`LOCATION:${esc(inv.venue)}`] : []), 'END:VEVENT', 'END:VCALENDAR'];
    ics = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(lines.join('\r\n'));
  }

  return (
    <div className="site rsvp-wrap">
      <div className="theme-float"><LangToggle /><SiteSettings /></div>
      <main className="rsvp-card">
        <span className="rc-corner tl" aria-hidden /><span className="rc-corner tr" aria-hidden /><span className="rc-corner bl" aria-hidden /><span className="rc-corner br" aria-hidden />
        <header className="rc-head">
          <div className="rc-logo"><Logo size={44} /></div>
          <p className="rc-eyebrow">{s('youAreInvited')}</p>
          <h1 className="rc-title">{inv.event_name}</h1>
          <div className="rc-orn" aria-hidden><i /><b /><i /></div>
          <p className="rc-hello">{s('hello', { name: inv.guest_name })}</p>
        </header>
        {(d || inv.event_time || inv.venue) && (
          <section className="rc-when" aria-label={s('whenWhere')}>
            {d && (
              <div className="rc-date" aria-label={`${weekday} ${dayNum} ${monthName} ${yearNum}`}>
                <span className="m">{monthName}</span>
                <span className="n">{dayNum}</span>
                <span className="w">{weekday}</span>
              </div>
            )}
            <div className="rc-details">
              {inv.event_time && (
                <p className="rc-line"><svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg><span>{inv.event_time}</span></p>
              )}
              {inv.venue && (
                <p className="rc-line"><svg viewBox="0 0 24 24" aria-hidden><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg><span>{inv.venue}</span></p>
              )}
              {inv.venue_url && <a className="rc-map" href={inv.venue_url} target="_blank" rel="noopener noreferrer">{s('openMaps')} ↗</a>}
              {countdown && <p className="rc-count">{countdown}</p>}
              {ics && <a className="rc-cal" href={ics} download="invitation.ics">{s('addToCalendar')}</a>}
            </div>
          </section>
        )}
        {inv.status === 'pending' && (
          <form action={answer} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <input type="hidden" name="token" value={token} />
            <p style={{ margin: 0 }}>{s('willYouCome', { event: inv.event_name })}</p>
            <GuestCount count={inv.party_size} pending token={token} />
            <div className="row">
              <button name="status" value="confirmed" className="btn primary">{s('yesWeCome')}</button>
              <button name="status" value="declined" className="btn">{s('noWeDecline')}</button>
            </div>
          </form>
        )}
        {inv.status === 'confirmed' && (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="notice ok" style={{ margin: 0 }}>{s('rsvpConfirmedShort')}</p>
            <GuestCount count={inv.confirmed_count ?? inv.party_size} token={token} action={changeCount} waitingExtra={inv.extra_requested ?? 0} saved={q.saved === '1'} />
            <p style={{ margin: 0 }}>{s('showCode')}</p>
            <div className="qr" role="img" aria-label={s('entryCode')} dangerouslySetInnerHTML={{ __html: qr }} />
            {focus && planLayout && (
              <div className="where-map">
                <h2 style={{ fontSize: '1.05em', margin: '0 0 4px' }}>{s('yourTable')}: {focus.seat ? s('tableSeat', { table: focus.table, n: focus.seat }) : s('tableOnly', { table: focus.table })}</h2>
                <ZoomPan><HallPreview layout={planLayout} label={s('yourTable')} focus={focus} /></ZoomPan>
              </div>
            )}
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
