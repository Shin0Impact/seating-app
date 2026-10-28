'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fillMessage, inviteState, totals, whatsappUrl, type InviteRow, type InviteState } from '@/lib/inviteview';
import { useLang, useS } from './LangProvider';
import { localeOf, type SKey } from '@/lib/site-i18n';
import { inviteDrafts, makeToken } from '@/lib/invites';
import { newGuest, parseLayout, type Guest } from '@/lib/layout';
import { matches } from '@/lib/search';
import { browserClient } from '@/lib/supabase/browser';

const COLS = '*';
const FILTER_KEYS: { key: InviteState | 'all'; label: SKey }[] = [
  { key: 'all', label: 'all' },
  { key: 'unsent', label: 'stUnsent' },
  { key: 'waiting', label: 'stWaiting' },
  { key: 'confirmed', label: 'stConfirmed' },
  { key: 'declined', label: 'stDeclined' },
  { key: 'arrived', label: 'stArrived' },
];
const STATE_KEY: Record<InviteState, SKey> = { unsent: 'stUnsent', waiting: 'stWaiting', confirmed: 'stConfirmed', declined: 'stDeclined', arrived: 'stArrived' };
const SHOWN = 150;

const WaIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z" />
  </svg>
);

export default function InvitesPanel({ eventId, eventName, initialGuests, initial, siteUrl }: { eventId: string; eventName: string; initialGuests: Guest[]; initial: InviteRow[]; siteUrl: string }) {
  const { lang } = useLang();
  const s = useS();
  const locale = localeOf(lang);
  /** Arabic number agreement: 1 → رابط واحد, 2 → رابطان, 3–10 → N روابط, 11+ → N رابطًا. */
  const linksWord = (n: number): string => {
    if (lang === 'en') return n === 1 ? s('oneLink') : s('nLinks', { n });
    if (n === 1) return s('oneLink');
    if (n === 2) return s('twoLinks');
    return n <= 10 ? s('nLinks', { n }) : `${n} رابطًا`;
  };
  const [guests, setGuests] = useState(initialGuests);
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InviteState | 'all'>('all');
  const [group, setGroup] = useState('');
  const [showTpl, setShowTpl] = useState(false);
  const [savedTpl, setSavedTpl] = useState<string | null>(null);
  const tpl = savedTpl ?? s('defaultTemplate');
  const pending = useRef(new Set<string>()); // tokens being changed here; a refresh must not undo them

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`invite-template:${eventId}`);
      if (stored) setSavedTpl(stored);
    } catch { /* storage unavailable */ }
  }, [eventId]);
  const saveTpl = (v: string | null) => {
    setSavedTpl(v);
    try { if (v === null) localStorage.removeItem(`invite-template:${eventId}`); else localStorage.setItem(`invite-template:${eventId}`, v); } catch { /* ignore */ }
  };

  const byGuest = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);
  const have = useMemo(() => new Set(rows.map((r) => r.guest_id)), [rows]);
  const missing = useMemo(() => inviteDrafts(guests).filter((d) => !have.has(d.guestId)), [guests, have]);
  const link = (tk: string) => `${siteUrl}/r/${tk}`;
  const message = (r: InviteRow) => fillMessage(tpl, { name: byGuest.get(r.guest_id)?.name ?? '', event: eventName, link: link(r.token), people: r.party_size });

  /** Pull what the other person changed: invites every few seconds, the guest list when the tab regains focus. */
  const refresh = useCallback(async (withGuests: boolean) => {
    const sb = browserClient();
    const inv = await sb.from('invites').select(COLS).eq('event_id', eventId).order('created_at');
    if (inv.error) return setLive(false);
    setLive(true);
    setRows((cur) => {
      const mine = new Map(cur.filter((r) => pending.current.has(r.token)).map((r) => [r.token, r]));
      return (inv.data as InviteRow[]).map((r) => mine.get(r.token) ?? r);
    });
    if (withGuests) {
      const ev = await sb.from('events').select('layout').eq('id', eventId).maybeSingle();
      if (ev.data) setGuests(parseLayout(ev.data.layout).guests);
    }
  }, [eventId]);

  useEffect(() => {
    const tick = setInterval(() => { if (!document.hidden) void refresh(false); }, 3000);
    const vis = () => { if (!document.hidden) void refresh(true); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', vis);
    return () => { clearInterval(tick); document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', vis); };
  }, [refresh]);

  async function createMissing() {
    setBusy(true);
    setMsg(null);
    const made = missing.map((d) => ({ token: makeToken(), event_id: eventId, guest_id: d.guestId, member_ids: d.memberIds, party_size: Math.min(d.partySize, 50) }));
    let n = 0;
    for (let i = 0; i < made.length; i += 200) {
      const { data, error } = await browserClient().from('invites').insert(made.slice(i, i + 200)).select(COLS);
      if (error) {
        setMsg({ kind: 'err', text: s('createFailedMsg') + error.message });
        break;
      }
      n += data.length;
      setRows((r) => [...r, ...(data as InviteRow[])]);
    }
    if (n) setMsg({ kind: 'ok', text: s('linksCreated', { links: linksWord(n) }) });
    setBusy(false);
  }

  async function setSent(r: InviteRow, sent: boolean) {
    const value = sent ? new Date().toISOString() : null;
    pending.current.add(r.token);
    setRows((cur) => cur.map((x) => (x.token === r.token ? { ...x, sent_at: value } : x)));
    // Marking as sent only fills an empty time, so a second phone never overwrites the first one's timestamp.
    const q = browserClient().from('invites').update({ sent_at: value }).eq('token', r.token);
    const { error } = await (sent ? q.is('sent_at', null) : q);
    pending.current.delete(r.token);
    if (error) {
      setRows((cur) => cur.map((x) => (x.token === r.token ? { ...x, sent_at: r.sent_at } : x)));
      setMsg({ kind: 'err', text: s('sentFailed') + error.message });
    }
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ kind: 'ok', text: done });
    } catch {
      setMsg({ kind: 'err', text: s('copyFailed') + text });
    }
  }

  function csv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = ['name,group,people,status,link', ...rows.map((r) => {
      const g = byGuest.get(r.guest_id);
      return [esc(g?.name ?? ''), esc(g?.group ?? ''), r.party_size, s(STATE_KEY[inviteState(r)]), esc(link(r.token))].join(',');
    })];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'invites.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const tot = totals(rows);
  const groups = useMemo(() => [...new Set(rows.map((r) => byGuest.get(r.guest_id)?.group ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b, locale)), [rows, byGuest]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[inviteState(r)] = (c[inviteState(r)] ?? 0) + 1;
    return c;
  }, [rows]);
  const list = useMemo(
    () => rows.filter((r) => {
      const g = byGuest.get(r.guest_id);
      if (filter !== 'all' && inviteState(r) !== filter) return false;
      if (group && g?.group !== group) return false;
      return matches(query, g?.name ?? '', g?.group ?? '');
    }),
    [rows, byGuest, filter, group, query],
  );
  const orphans = useMemo(() => rows.filter((r) => !byGuest.has(r.guest_id)), [rows, byGuest]);
  const changeReqs = useMemo(() => rows.filter((r) => r.change_requested_at && r.status === 'pending'), [rows]);
  const countChanges = useMemo(() => rows.filter((r) => r.count_changed_at && !(r.extra_requested ?? 0)), [rows]);
  async function dismissCount(r: InviteRow) {
    pending.current.add(r.token);
    setRows((cur) => cur.map((x) => (x.token === r.token ? { ...x, count_changed_at: null } : x)));
    await browserClient().from('invites').update({ count_changed_at: null }).eq('token', r.token);
    pending.current.delete(r.token);
  }
  const moreReqs = useMemo(() => rows.filter((r) => (r.extra_requested ?? 0) > 0), [rows]);
  async function dismissChange(r: InviteRow) {
    pending.current.add(r.token);
    setRows((cur) => cur.map((x) => (x.token === r.token ? { ...x, change_requested_at: null } : x)));
    await browserClient().from('invites').update({ change_requested_at: null }).eq('token', r.token);
    pending.current.delete(r.token);
  }
  async function dismissMore(r: InviteRow) {
    pending.current.add(r.token);
    setRows((cur) => cur.map((x) => (x.token === r.token ? { ...x, extra_requested: 0, count_changed_at: null } : x)));
    await browserClient().from('invites').update({ extra_requested: 0, count_changed_at: null }).eq('token', r.token);
    pending.current.delete(r.token);
  }
  /** Adds the extra people to the plan ("Name +k", unseated, same group), grows the invite, and clears the request. */
  async function approveMore(r: InviteRow) {
    const n = r.extra_requested ?? 0;
    if (n < 1) return;
    pending.current.add(r.token);
    const sb = browserClient();
    try {
      const ev = await sb.from('events').select('layout,version').eq('id', eventId).maybeSingle();
      if (!ev.data) throw new Error(s('planCheckFailed'));
      const layout = parseLayout(ev.data.layout);
      const head = layout.guests.find((g) => g.id === r.guest_id);
      if (!head) throw new Error(s('planCheckFailed'));
      if (r.party_size + n > 50) throw new Error('max 50');
      const taken = new Set(layout.guests.filter((g) => g.group === head.group).map((g) => g.name));
      const made: Guest[] = [];
      let k = r.party_size - 1;
      while (made.length < n) {
        k += 1;
        const name = `${head.name} +${k}`;
        if (!taken.has(name)) made.push(newGuest(name, head.group, null, false, null));
      }
      const next = { ...layout, guests: [...layout.guests, ...made] };
      const saved = await sb.from('events').update({ layout: next, version: ev.data.version + 1, updated_at: new Date().toISOString() }).eq('id', eventId).eq('version', ev.data.version).select('version');
      if (saved.error || !saved.data || saved.data.length === 0) throw new Error(saved.error?.message ?? s('planCheckFailed'));
      const members = [...(((r as InviteRow & { member_ids?: string[] }).member_ids) ?? []), ...made.map((g) => g.id)];
      const patch = { party_size: r.party_size + n, member_ids: members, confirmed_count: r.confirmed_count === null ? null : r.confirmed_count + n, extra_requested: 0, count_changed_at: null };
      const up = await sb.from('invites').update(patch).eq('token', r.token);
      if (up.error) throw new Error(up.error.message);
      setGuests(next.guests);
      setRows((cur) => cur.map((x) => (x.token === r.token ? { ...x, ...patch } : x)));
      setMsg({ kind: 'ok', text: s('moreAdded', { n, name: head.name }) });
    } catch (e) {
      setMsg({ kind: 'err', text: s('moreAddFailed') + (e instanceof Error ? e.message : '') });
    } finally {
      pending.current.delete(r.token);
    }
  }
  const [confirmDel, setConfirmDel] = useState<string | null>(null); // token, or 'all'

  /** Deletes invite links whose guest is no longer in the plan. The saved plan is re-read first, so a stale tab can't delete a live invite. */
  async function removeOrphans(tokens: string[]) {
    setConfirmDel(null);
    const sb = browserClient();
    const ev = await sb.from('events').select('layout').eq('id', eventId).maybeSingle();
    if (!ev.data) return setMsg({ kind: 'err', text: s('planCheckFailed') });
    const live = new Set(parseLayout(ev.data.layout).guests.map((g) => g.id));
    const safe = rows.filter((r) => tokens.includes(r.token) && !live.has(r.guest_id)).map((r) => r.token);
    if (safe.length === 0) return refresh(true);
    for (let i = 0; i < safe.length; i += 100) {
      const { error } = await sb.from('invites').delete().in('token', safe.slice(i, i + 100));
      if (error) return setMsg({ kind: 'err', text: s('deleteFailedMsg') + error.message });
    }
    setRows((cur) => cur.filter((r) => !safe.includes(r.token)));
    setMsg({ kind: 'ok', text: s('linksDeleted', { n: safe.length, w: safe.length === 1 ? s('linkWord') : s('linksWord') }) });
  }
  const sampleName = useMemo(() => {
    const nameOf = (id: string) => byGuest.get(id)?.name;
    const unsent = rows.find((r) => !r.sent_at && r.status === 'pending' && nameOf(r.guest_id));
    return (unsent && nameOf(unsent.guest_id)) || (missing[0] && nameOf(missing[0].guestId)) || (rows[0] && nameOf(rows[0].guest_id)) || s('name');
  }, [rows, missing, byGuest, s]);
  const pct = (n: number) => (tot.families ? (n / tot.families) * 100 : 0);

  return (
    <>
      <div className="stats">
        <div className="stat"><b>{tot.families}</b><span>{s('famPeople', { n: '', p: tot.people }).trim()}</span></div>
        <div className="stat"><b>{tot.sent}</b><span>{s('sentTo')}</span></div>
        <div className="stat"><b>{tot.confirmedFamilies}</b><span>{s('confirmedStat', { p: tot.confirmedPeople })}</span></div>
        <div className="stat"><b>{tot.declined}</b><span>{s('declinedStat')}</span></div>
        <div className="stat"><b>{tot.arrived}</b><span>{s('arrivedStat')}</span></div>
      </div>
      <div className="progress" role="img" aria-label={s('progress')}>
        <i className="p-yes" style={{ width: `${pct(tot.confirmedFamilies)}%` }} />
        <i className="p-no" style={{ width: `${pct(tot.declined)}%` }} />
        <i className="p-sent" style={{ width: `${pct(Math.max(0, tot.sent - tot.confirmedFamilies - tot.declined))}%` }} />
      </div>

      {missing.length > 0 && (
        <div className="notice info" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span>{rows.length === 0 ? s('noLinksYet') : s('newFamiliesNoLink', { n: missing.length })} {s('oneLinkPerGuestHint')}</span>
          <button className="btn primary" disabled={busy} onClick={createMissing}>{busy ? s('creating') : s('createLinks', { links: linksWord(missing.length) })}</button>
        </div>
      )}
      {changeReqs.length > 0 && (
        <div className="notice info" role="status">
          <b>{s('changeBanner', { n: changeReqs.length })}</b>
          {changeReqs.map((r) => <span key={r.token} style={{ display: 'inline-block', marginInlineStart: 10 }}>{byGuest.get(r.guest_id)?.name ?? ''}</span>)}
        </div>
      )}
      {countChanges.length > 0 && (
        <div className="notice info" role="status">
          <b>{s('countBanner', { n: countChanges.length })}</b>
          {countChanges.map((r) => <span key={r.token} style={{ display: 'inline-block', marginInlineStart: 10 }}>{byGuest.get(r.guest_id)?.name ?? ''} → {r.count_changed_to}</span>)}
        </div>
      )}
      {moreReqs.length > 0 && (
        <div className="notice info" role="status">
          <b>{s('moreBanner', { n: moreReqs.length })}</b>
          {moreReqs.map((r) => <span key={r.token} style={{ display: 'inline-block', marginInlineStart: 10 }}>{byGuest.get(r.guest_id)?.name ?? ''} +{r.extra_requested}</span>)}
        </div>
      )}
      {orphans.length > 0 && (
        <div className="notice err" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span>{s('orphanBanner', { n: orphans.length, w: orphans.length === 1 ? s('linkWord') : s('linksWord') })}{orphans.some((o) => o.checked_in_at) ? s('orphanSomeArrived') : ''}.</span>
          {confirmDel === 'all' ? (
            <span style={{ display: 'flex', gap: 8 }}>
              <button className="btn danger-fill" onClick={() => removeOrphans(orphans.map((o) => o.token))}>{s('yesDelete', { n: orphans.length })}</button>
              <button className="btn" onClick={() => setConfirmDel(null)}>{s('cancel')}</button>
            </span>
          ) : (
            <button className="btn danger" onClick={() => setConfirmDel('all')}>{s('deleteExtraLinks')}</button>
          )}
        </div>
      )}
      {msg && <p className={`notice ${msg.kind}`} role="status">{msg.text}</p>}

      <div className="card-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2>{s('messageText')}</h2>
          <button className="btn small" onClick={() => setShowTpl(!showTpl)}>{showTpl ? s('hide') : s('editText')}</button>
        </div>
        {showTpl && (
          <>
            <label className="field-col">{s('placeholdersHint')}
              <textarea value={tpl} onChange={(e) => saveTpl(e.target.value)} />
            </label>
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => saveTpl(null)}>{s('restoreText')}</button>
          </>
        )}
        <p className="muted" style={{ margin: 0, whiteSpace: 'pre-line' }}>{fillMessage(tpl, { name: sampleName, event: eventName, link: `${siteUrl}/r/…`, people: 4 })}</p>
      </div>

      <div className="toolbar">
        <label className="search">
          <span aria-hidden>🔍</span>
          <input type="search" placeholder={s('searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={s('searchAria')} />
        </label>
        {groups.length > 1 && (
          <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label={s('groupAria')}>
            <option value="">{s('allGroups')}</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <span className={`live${live ? '' : ' off'}`}>{live ? s('liveOn') : s('liveOff')}</span>
        <button className="btn small" onClick={csv} disabled={rows.length === 0}>{s('downloadLinks')}</button>
      </div>
      <div className="chips">
        {FILTER_KEYS.map((f) => (
          <button key={f.key} className={`chip${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
            {s(f.label)} <em>{counts[f.key] ?? 0}</em>
          </button>
        ))}
      </div>

      <ul className="inv-list">
        {list.slice(0, SHOWN).map((r) => {
          const g = byGuest.get(r.guest_id);
          const st = inviteState(r);
          return (
            <li key={r.token} className={`inv${r.sent_at ? ' sent' : ''}`}>
              <div className="inv-main">
                <div className="inv-name">
                  <span>{g?.name ?? s('deletedFromPlan')}</span>
                  {r.party_size > 1 && <span className="party" title={s('partyTitle')}>+{r.party_size - 1}</span>}
                  <span className={`pill ${st}`}>{s(STATE_KEY[st])}{st === 'confirmed' ? ` (${r.confirmed_count ?? r.party_size}/${r.party_size})` : ''}</span>
                  {r.change_requested_at && r.status === 'pending' && <span className="pill waiting">{s('changeRequested')} <button className="linkbtn" style={{ marginInlineStart: 4 }} onClick={() => dismissChange(r)}>{s('dismiss')}</button></span>}
                  {r.count_changed_at && !(r.extra_requested ?? 0) && <span className="pill waiting">{s('countChangedPill', { n: r.count_changed_to ?? 0 })} <button className="linkbtn" style={{ marginInlineStart: 4 }} onClick={() => dismissCount(r)}>{s('dismiss')}</button></span>}
                  {(r.extra_requested ?? 0) > 0 && (
                    <span className="pill waiting">{s('moreRequested', { n: r.extra_requested ?? 0 })}
                      <button className="linkbtn" style={{ marginInlineStart: 6 }} onClick={() => approveMore(r)}>{s('approveAdd')}</button>
                      <button className="linkbtn" style={{ marginInlineStart: 6 }} onClick={() => dismissMore(r)}>{s('rejectMore')}</button>
                    </span>
                  )}
                </div>
                <div className="inv-sub">
                  {g?.group && <span>{g.group}</span>}
                  {r.sent_at && <span>{s('sentAt', { when: new Date(r.sent_at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })}</span>}
                </div>
              </div>
              <div className="inv-actions">
                <a className="btn wa small" href={whatsappUrl(message(r))} target="_blank" rel="noopener noreferrer" onClick={(e) => {
                  if (r.sent_at) {
                    const when = new Date(r.sent_at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                    if (!window.confirm(s('alreadySentConfirm', { when }))) e.preventDefault();
                    return;
                  }
                  void setSent(r, true);
                }}>
                  <WaIcon /> {s('whatsapp')}
                </a>
                <button className="btn small" onClick={() => copy(message(r), s('messageCopied'))}>{s('copyMessage')}</button>
                <button className="btn small" onClick={() => copy(link(r.token), s('linkCopied'))}>{s('copyLink')}</button>
                {!g && (confirmDel === r.token ? (
                  <>
                    <button className="btn small danger-fill" onClick={() => removeOrphans([r.token])}>{s('confirmDelete')}</button>
                    <button className="btn small" onClick={() => setConfirmDel(null)}>{s('cancel')}</button>
                  </>
                ) : (
                  <button className="btn small danger" onClick={() => setConfirmDel(r.token)}>{s('deleteLink')}</button>
                ))}
                <button className="btn small" onClick={() => setSent(r, !r.sent_at)}>{r.sent_at ? s('undoSent') : s('markSent')}</button>
              </div>
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="empty">{rows.length === 0 ? s('noInvites') : s('noMatches')}</p>}
      {list.length > SHOWN && <p className="muted">{s('showingFirst', { n: SHOWN, total: list.length })}</p>}
    </>
  );
}
