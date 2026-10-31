import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteHeader, StepBar } from '@/components/Site';
import { DEFAULT_OPTIONS, parseLayout } from '@/lib/layout';
import { chairsInHall, chairsNeeded, expectTotals } from '@/lib/expect';
import { totals, type InviteRow } from '@/lib/inviteview';
import DeleteEvent from '@/components/DeleteEvent';
import { renameEvent } from '@/app/actions';
import { serverClient } from '@/lib/supabase/server';
import { getS } from '@/lib/lang-server';

export const dynamic = 'force-dynamic';

export default async function EventHome({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ delete?: string; rename?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await serverClient();
  const [{ data: ev }, { data: invites }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).maybeSingle(),
    supabase.from('invites').select('*').eq('event_id', id),
  ]);
  if (!ev) notFound();
  const { s } = await getS();
  const layout = parseLayout(ev.layout);
  const tables = layout.elements.filter((e) => e.kind === 'table').length;
  const seated = layout.guests.filter((g) => g.tableId).length;
  const t = totals((invites ?? []) as InviteRow[]);
  const maybeSeats = layout.options?.maybeSeats ?? DEFAULT_OPTIONS.maybeSeats;
  const exp = expectTotals(layout.guests, (invites ?? []) as InviteRow[]);
  const hallChairs = chairsInHall(layout);
  const need = chairsNeeded(exp, maybeSeats);
  const changeCount = ((invites ?? []) as InviteRow[]).filter(
    (r) => r.change_requested_at && r.status === 'pending',
  ).length;
  const countChanged = ((invites ?? []) as InviteRow[]).filter(
    (r) => r.count_changed_at && !(r.extra_requested ?? 0),
  ).length;
  const moreCount = ((invites ?? []) as InviteRow[]).filter((r) => (r.extra_requested ?? 0) > 0).length;
  const delMsg = q.delete === 'mismatch' ? s('deleteMismatch') : s('deleteFailed');
  const renameMsg =
    q.rename === 'saved' ? s('renameSaved') : q.rename === 'invalid' ? s('renameInvalid') : s('renameError');
  return (
    <div className="site">
      <SiteHeader crumb={{ id, name: ev.name }} />
      <main className="container">
        <div className="page-title">
          <h1>{ev.name}</h1>
        </div>
        <StepBar id={id} active="home" />
        <div className="step-cards">
          <section className="step-card">
            <div className="sc-head">
              <span className="n">1</span>
              <h3>{s('guests')}</h3>
            </div>
            <div className="big">{layout.guests.length}</div>
            <p className="muted" style={{ margin: 0 }}>
              {layout.guests.length ? s('guestsInList') : s('startImportHint')}
            </p>
            <Link className="btn" href={`/events/${id}/import`}>
              {layout.guests.length ? s('importMore') : s('importList')}
            </Link>
          </section>
          <section className="step-card">
            <div className="sc-head">
              <span className="n">2</span>
              <h3>{s('hallPlan')}</h3>
            </div>
            <div className="big">{tables}</div>
            <p className="muted" style={{ margin: 0 }}>
              {tables ? s('tablesLine', { seated, total: layout.guests.length }) : s('drawHint')}
            </p>
            {tables > 0 && layout.guests.length > 0 && (
              <p className={`exp-line${need > hallChairs ? ' over' : ''}`}>
                {s('chairsLine', { n: need, total: hallChairs })}
                {need > hallChairs ? ` · ${s('chairsShort', { k: need - hallChairs })}` : ''}
              </p>
            )}
            <Link className="btn" href={`/events/${id}/preview`}>
              {s('viewPlan')}
            </Link>
          </section>
          <section className="step-card">
            <div className="sc-head">
              <span className="n">3</span>
              <h3>{s('invitations')}</h3>
            </div>
            <div className="big">{t.families ? `${t.sent}/${t.families}` : '—'}</div>
            <p className="muted" style={{ margin: 0 }}>
              {t.families ? s('sentLine', { yes: t.confirmedFamilies }) : s('oneLinkHint')}
            </p>
            {layout.guests.length > 0 && (
              <p className="exp-line">{s('expLine', { s: exp.sure, m: exp.maybe, c: exp.court })}</p>
            )}
            {changeCount > 0 && (
              <p className="notice info" style={{ margin: 0 }}>
                {s('changeBanner', { n: changeCount })}
              </p>
            )}
            {countChanged > 0 && (
              <p className="notice info" style={{ margin: 0 }}>
                {s('countBanner', { n: countChanged })}
              </p>
            )}
            {moreCount > 0 && (
              <p className="notice info" style={{ margin: 0 }}>
                {s('moreBanner', { n: moreCount })}
              </p>
            )}
            <Link className="btn" href={`/events/${id}/invites`}>
              {s('manageInvites')}
            </Link>
          </section>
          <section className="step-card">
            <div className="sc-head">
              <span className="n">4</span>
              <h3>{s('entry')}</h3>
            </div>
            <div className="big">{t.arrived}</div>
            <p className="muted" style={{ margin: 0 }}>
              {t.families ? s('arrivedLine', { yes: t.confirmedFamilies }) : s('scanHint')}
            </p>
            <Link className="btn" href={`/events/${id}/scan`}>
              {s('openScanner')}
            </Link>
          </section>
        </div>
        <p className="muted small-note">{s('splitNote')}</p>
        <details className="event-settings" open={!!q.rename || !!q.delete}>
          <summary>{s('eventSettings')}</summary>
          {q.delete && (
            <p className="notice err" role="alert">
              {delMsg}
            </p>
          )}
          {q.rename && (
            <p className={`notice ${q.rename === 'saved' ? 'ok' : 'err'}`} role="status">
              {renameMsg}
            </p>
          )}
          <form action={renameEvent} className="rename-form">
            <input type="hidden" name="id" value={id} />
            <label className="field-col">
              {s('name')}
              <input name="name" defaultValue={ev.name} required maxLength={120} />
            </label>
            <label className="field-col">
              {s('dateLabel')}
              <input name="date" type="date" defaultValue={ev.event_date ?? ''} />
            </label>
            <label className="field-col">
              {s('timeLabel')}
              <input name="time" type="time" defaultValue={ev.event_time ?? ''} />
            </label>
            <label className="field-col">
              {s('venueLabel')}
              <input name="venue" defaultValue={ev.venue ?? ''} maxLength={200} />
            </label>
            <label className="field-col">
              {s('venueUrlLabel')}
              <input
                name="venue_url"
                type="url"
                inputMode="url"
                placeholder="https://maps.google.com/…"
                defaultValue={ev.venue_url ?? ''}
                maxLength={500}
              />
            </label>
            <input type="hidden" name="has_maybe_seats" value="1" />
            <label className="check-row">
              <input type="checkbox" name="maybe_seats" defaultChecked={maybeSeats} />
              <span>
                <b>{s('maybeSeats')}</b>
                <small className="muted">{s('maybeSeatsHint')}</small>
              </span>
            </label>
            <button className="btn">{s('save')}</button>
          </form>
          <DeleteEvent id={id} name={ev.name} />
        </details>
      </main>
    </div>
  );
}
