'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_TEMPLATE, STATE_LABEL, fillMessage, inviteState, totals, whatsappUrl, type InviteRow, type InviteState } from '@/lib/inviteview';
import { inviteDrafts, makeToken } from '@/lib/invites';
import { parseLayout, type Guest } from '@/lib/layout';
import { matches } from '@/lib/search';
import { browserClient } from '@/lib/supabase/browser';

const COLS = 'token,guest_id,party_size,status,confirmed_count,checked_in_at,sent_at';
const FILTERS: { key: InviteState | 'all'; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'unsent', label: STATE_LABEL.unsent },
  { key: 'waiting', label: STATE_LABEL.waiting },
  { key: 'confirmed', label: STATE_LABEL.confirmed },
  { key: 'declined', label: STATE_LABEL.declined },
  { key: 'arrived', label: STATE_LABEL.arrived },
];
const SHOWN = 150;

const WaIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z" />
  </svg>
);

/** Arabic number agreement: 1 → رابط واحد, 2 → رابطان, 3–10 → N روابط, 11+ → N رابطًا. */
function linksWord(n: number): string {
  if (n === 1) return 'رابط واحد';
  if (n === 2) return 'رابطان';
  return n <= 10 ? `${n} روابط` : `${n} رابطًا`;
}

export default function InvitesPanel({ eventId, eventName, initialGuests, initial, siteUrl }: { eventId: string; eventName: string; initialGuests: Guest[]; initial: InviteRow[]; siteUrl: string }) {
  const [guests, setGuests] = useState(initialGuests);
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InviteState | 'all'>('all');
  const [group, setGroup] = useState('');
  const [showTpl, setShowTpl] = useState(false);
  const [tpl, setTpl] = useState(DEFAULT_TEMPLATE);
  const pending = useRef(new Set<string>()); // tokens being changed here; a refresh must not undo them

  useEffect(() => {
    try {
      const s = localStorage.getItem(`invite-template:${eventId}`);
      if (s) setTpl(s);
    } catch { /* storage unavailable */ }
  }, [eventId]);
  const saveTpl = (v: string) => {
    setTpl(v);
    try { localStorage.setItem(`invite-template:${eventId}`, v); } catch { /* ignore */ }
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
        setMsg({ kind: 'err', text: 'تعذّر إنشاء الدعوات: ' + error.message });
        break;
      }
      n += data.length;
      setRows((r) => [...r, ...(data as InviteRow[])]);
    }
    if (n) setMsg({ kind: 'ok', text: `تم إنشاء ${linksWord(n)}، رابط لكل عائلة.` });
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
      setMsg({ kind: 'err', text: 'تعذّر تسجيل الإرسال: ' + error.message });
    }
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMsg({ kind: 'ok', text: done });
    } catch {
      setMsg({ kind: 'err', text: 'تعذّر النسخ. انسخ يدويًا: ' + text });
    }
  }

  function csv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = ['name,group,people,status,link', ...rows.map((r) => {
      const g = byGuest.get(r.guest_id);
      return [esc(g?.name ?? ''), esc(g?.group ?? ''), r.party_size, STATE_LABEL[inviteState(r)], esc(link(r.token))].join(',');
    })];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'invites.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const tot = totals(rows);
  const groups = useMemo(() => [...new Set(rows.map((r) => byGuest.get(r.guest_id)?.group ?? '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar')), [rows, byGuest]);
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
  const [confirmDel, setConfirmDel] = useState<string | null>(null); // token, or 'all'

  /** Deletes invite links whose guest is no longer in the plan. The saved plan is re-read first, so a stale tab can't delete a live invite. */
  async function removeOrphans(tokens: string[]) {
    setConfirmDel(null);
    const sb = browserClient();
    const ev = await sb.from('events').select('layout').eq('id', eventId).maybeSingle();
    if (!ev.data) return setMsg({ kind: 'err', text: 'تعذّر التحقق من المخطط. حاول مرة أخرى.' });
    const live = new Set(parseLayout(ev.data.layout).guests.map((g) => g.id));
    const safe = rows.filter((r) => tokens.includes(r.token) && !live.has(r.guest_id)).map((r) => r.token);
    if (safe.length === 0) return refresh(true);
    for (let i = 0; i < safe.length; i += 100) {
      const { error } = await sb.from('invites').delete().in('token', safe.slice(i, i + 100));
      if (error) return setMsg({ kind: 'err', text: 'تعذّر الحذف: ' + error.message });
    }
    setRows((cur) => cur.filter((r) => !safe.includes(r.token)));
    setMsg({ kind: 'ok', text: `تم حذف ${safe.length} ${safe.length === 1 ? 'رابط' : 'روابط'}.` });
  }
  const pct = (n: number) => (tot.families ? (n / tot.families) * 100 : 0);

  return (
    <>
      <div className="stats">
        <div className="stat"><b>{tot.families}</b><span>عائلة · {tot.people} شخصًا</span></div>
        <div className="stat"><b>{tot.sent}</b><span>أُرسلت لها الدعوة</span></div>
        <div className="stat"><b>{tot.confirmedFamilies}</b><span>أكّدت · {tot.confirmedPeople} شخصًا</span></div>
        <div className="stat"><b>{tot.declined}</b><span>اعتذرت</span></div>
        <div className="stat"><b>{tot.arrived}</b><span>وصلت</span></div>
      </div>
      <div className="progress" role="img" aria-label="تقدّم الدعوات">
        <i className="p-yes" style={{ width: `${pct(tot.confirmedFamilies)}%` }} />
        <i className="p-no" style={{ width: `${pct(tot.declined)}%` }} />
        <i className="p-sent" style={{ width: `${pct(Math.max(0, tot.sent - tot.confirmedFamilies - tot.declined))}%` }} />
      </div>

      {missing.length > 0 && (
        <div className="notice info" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span>{rows.length === 0 ? 'لم تُنشأ روابط بعد.' : `${missing.length} عائلة جديدة في المخطط بلا رابط.`} يُنشأ رابط واحد لكل ضيف مُسمّى، ويشمل المرافقين (+1، +2…).</span>
          <button className="btn primary" disabled={busy} onClick={createMissing}>{busy ? 'جارٍ الإنشاء…' : `إنشاء ${linksWord(missing.length)}`}</button>
        </div>
      )}
      {orphans.length > 0 && (
        <div className="notice err" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span>{orphans.length} {orphans.length === 1 ? 'رابط' : 'روابط'} لضيوف حُذفوا من المخطط. لن يعمل الرابط بعد حذفه{orphans.some((o) => o.checked_in_at) ? '، وبعضها سُجّل دخوله' : ''}.</span>
          {confirmDel === 'all' ? (
            <span style={{ display: 'flex', gap: 8 }}>
              <button className="btn danger-fill" onClick={() => removeOrphans(orphans.map((o) => o.token))}>نعم، احذف {orphans.length}</button>
              <button className="btn" onClick={() => setConfirmDel(null)}>إلغاء</button>
            </span>
          ) : (
            <button className="btn danger" onClick={() => setConfirmDel('all')}>حذف الروابط الزائدة…</button>
          )}
        </div>
      )}
      {msg && <p className={`notice ${msg.kind}`} role="status">{msg.text}</p>}

      <div className="card-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <h2>نص الرسالة</h2>
          <button className="btn small" onClick={() => setShowTpl(!showTpl)}>{showTpl ? 'إخفاء' : 'تعديل النص'}</button>
        </div>
        {showTpl && (
          <>
            <label className="field-col">يمكنك استخدام {'{name}'} و{'{event}'} و{'{link}'} و{'{people}'}
              <textarea value={tpl} onChange={(e) => saveTpl(e.target.value)} />
            </label>
            <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => saveTpl(DEFAULT_TEMPLATE)}>استعادة النص الأصلي</button>
          </>
        )}
        <p className="muted" style={{ margin: 0, whiteSpace: 'pre-line' }}>{fillMessage(tpl, { name: 'أبو سامي', event: eventName, link: `${siteUrl}/r/…`, people: 4 })}</p>
      </div>

      <div className="toolbar">
        <label className="search">
          <span aria-hidden>🔍</span>
          <input type="search" placeholder="ابحث عن عائلة أو مجموعة" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="بحث" />
        </label>
        {groups.length > 1 && (
          <select value={group} onChange={(e) => setGroup(e.target.value)} aria-label="المجموعة">
            <option value="">كل المجموعات</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
        <span className={`live${live ? '' : ' off'}`}>{live ? 'يتحدّث تلقائيًا' : 'انقطع الاتصال'}</span>
        <button className="btn small" onClick={csv} disabled={rows.length === 0}>تنزيل الروابط (CSV)</button>
      </div>
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label} <em>{counts[f.key] ?? 0}</em>
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
                  <span>{g?.name ?? '— (حُذف من المخطط)'}</span>
                  {r.party_size > 1 && <span className="party" title="عدد أفراد العائلة المدعوين">+{r.party_size - 1}</span>}
                  <span className={`pill ${st}`}>{STATE_LABEL[st]}{st === 'confirmed' ? ` (${r.confirmed_count ?? r.party_size}/${r.party_size})` : ''}</span>
                </div>
                <div className="inv-sub">
                  {g?.group && <span>{g.group}</span>}
                  {r.sent_at && <span>أُرسلت {new Date(r.sent_at).toLocaleString('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                </div>
              </div>
              <div className="inv-actions">
                <a className="btn wa small" href={whatsappUrl(message(r))} target="_blank" rel="noopener noreferrer" onClick={(e) => {
                  if (r.sent_at) {
                    const when = new Date(r.sent_at).toLocaleString('ar', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                    if (!window.confirm(`أُرسلت هذه الدعوة بالفعل (${when}). هل تريد إرسالها مرة أخرى؟`)) e.preventDefault();
                    return;
                  }
                  void setSent(r, true);
                }}>
                  <WaIcon /> واتساب
                </a>
                <button className="btn small" onClick={() => copy(message(r), 'تم نسخ الرسالة مع الرابط')}>نسخ الرسالة</button>
                <button className="btn small" onClick={() => copy(link(r.token), 'تم نسخ الرابط')}>نسخ الرابط</button>
                {!g && (confirmDel === r.token ? (
                  <>
                    <button className="btn small danger-fill" onClick={() => removeOrphans([r.token])}>تأكيد الحذف</button>
                    <button className="btn small" onClick={() => setConfirmDel(null)}>إلغاء</button>
                  </>
                ) : (
                  <button className="btn small danger" onClick={() => setConfirmDel(r.token)}>حذف الرابط…</button>
                ))}
                <button className="btn small" onClick={() => setSent(r, !r.sent_at)}>{r.sent_at ? 'إلغاء «أُرسلت»' : 'تمّ الإرسال'}</button>
              </div>
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="empty">{rows.length === 0 ? 'لا توجد دعوات بعد.' : 'لا نتائج مطابقة.'}</p>}
      {list.length > SHOWN && <p className="muted">يظهر أول {SHOWN} من {list.length}. استخدم البحث أو الفلاتر.</p>}
    </>
  );
}
