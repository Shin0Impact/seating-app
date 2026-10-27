'use client';

import { useMemo, useState } from 'react';
import { inviteDrafts, makeToken } from '@/lib/invites';
import type { Guest } from '@/lib/layout';
import { browserClient } from '@/lib/supabase/browser';

export type InviteRow = { token: string; guest_id: string; party_size: number; status: string; confirmed_count: number | null; checked_in_at: string | null };

const STATUS: Record<string, string> = { pending: 'بانتظار الرد', confirmed: 'أكّد', declined: 'اعتذر' };

export default function InvitesPanel({ eventId, guests, initial, siteUrl }: { eventId: string; guests: Guest[]; initial: InviteRow[]; siteUrl: string }) {
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const byGuest = useMemo(() => new Map(guests.map((g) => [g.id, g])), [guests]);
  const have = useMemo(() => new Set(rows.map((r) => r.guest_id)), [rows]);
  const missing = useMemo(() => inviteDrafts(guests).filter((d) => !have.has(d.guestId)), [guests, have]);
  const link = (t: string) => `${siteUrl}/r/${t}`;

  async function createMissing() {
    setBusy(true);
    setMsg('');
    const made = missing.map((d) => ({ token: makeToken(), event_id: eventId, guest_id: d.guestId, member_ids: d.memberIds, party_size: Math.min(d.partySize, 50) }));
    for (let i = 0; i < made.length; i += 200) {
      const { data, error } = await browserClient().from('invites').insert(made.slice(i, i + 200)).select('token,guest_id,party_size,status,confirmed_count,checked_in_at');
      if (error) {
        setMsg('تعذّر إنشاء الدعوات: ' + error.message);
        break;
      }
      setRows((r) => [...r, ...(data as InviteRow[])]);
    }
    setBusy(false);
  }

  function csv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = ['name,group,people,link', ...rows.map((r) => {
      const g = byGuest.get(r.guest_id);
      return [esc(g?.name ?? ''), esc(g?.group ?? ''), r.party_size, esc(link(r.token))].join(',');
    })];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'invites.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <section className="stack">
      <p className="muted">
        {rows.length} دعوة · أكّد {count('confirmed')} · اعتذر {count('declined')} · بانتظار {count('pending')} · حضر {rows.filter((r) => r.checked_in_at).length}
      </p>
      <div className="row">
        <button className="primary" disabled={busy || missing.length === 0} onClick={createMissing}>إنشاء {missing.length} دعوة ناقصة</button>
        <button disabled={rows.length === 0} onClick={csv}>تنزيل الروابط (CSV)</button>
      </div>
      {msg && <p className="form-error" role="alert">{msg}</p>}
      <table className="invites">
        <thead><tr><th>الاسم</th><th>المجموعة</th><th>العدد</th><th>الحالة</th><th></th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const g = byGuest.get(r.guest_id);
            return (
              <tr key={r.token}>
                <td>{g?.name ?? '— (حُذف من المخطط)'}</td>
                <td>{g?.group}</td>
                <td>{r.status === 'confirmed' ? `${r.confirmed_count}/${r.party_size}` : r.party_size}</td>
                <td>{r.checked_in_at ? 'حضر ✔' : STATUS[r.status] ?? r.status}</td>
                <td>
                  <button onClick={() => navigator.clipboard?.writeText(link(r.token)).then(() => setMsg('تم نسخ الرابط'), () => setMsg(link(r.token)))}>نسخ الرابط</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
