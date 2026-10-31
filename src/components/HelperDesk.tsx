'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { parseLayout, type Layout } from '@/lib/layout';
import { locate, seatsSummary } from '@/lib/invites';
import { buildFocus } from '@/lib/route';
import { useS } from './LangProvider';
import ZoomPan from './ZoomPan';
import Scanner, { ScanResultView, type ScanResult } from './Scanner';

type Inv = {
  token: string;
  guest_id: string;
  member_ids: string[];
  party_size: number;
  status: string;
  confirmed_count: number | null;
  checked_in_at: string | null;
};
type Data = { name: string; layout: unknown; invites: Inv[] };

/** The door desk for helpers: no login, only the secret link. All access goes through token-checked database functions. */
export default function HelperDesk({ token }: { token: string }) {
  const s = useS();
  const sb = useMemo(() => browserClient(), []);
  const [data, setData] = useState<Data | null>(null);
  const [dead, setDead] = useState(false);
  const [tab, setTab] = useState<'scan' | 'names'>('scan');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<{ token: string; n: number } | null>(null);
  const [walk, setWalk] = useState({ name: '', n: 1 });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data: d, error } = await sb.rpc('helper_get', { p_token: token });
    if (error) return;
    if (!d) return setDead(true);
    setDead(false);
    setData(d as Data);
  }, [sb, token]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 10000);
    return () => clearInterval(t);
  }, [load]);

  const layout: Layout | null = useMemo(() => (data ? parseLayout(data.layout) : null), [data]);
  const nameOf = useMemo(() => new Map((layout?.guests ?? []).map((g) => [g.id, g.name])), [layout]);

  const dataRef = useRef<{ data: Data | null; layout: Layout | null }>({ data: null, layout: null });
  dataRef.current = { data, layout };

  /** Where to take an invite's people: the same result the scanner shows, built from the hall we already hold. */
  const describe = useCallback(
    (
      i: Pick<Inv, 'guest_id' | 'member_ids' | 'party_size' | 'status' | 'confirmed_count'>,
      already: string | null = null,
    ): ScanResult => {
      const lay = dataRef.current.layout;
      const ids = [i.guest_id, ...i.member_ids];
      return {
        ok: true,
        already,
        status: i.status,
        partySize: i.party_size,
        confirmedCount: i.confirmed_count,
        placements: lay ? locate(lay, ids) : [],
        plan: lay
          ? { settings: lay.settings, elements: lay.elements }
          : ({ settings: undefined, elements: [] } as never),
        focus: lay ? buildFocus(lay, ids) : null,
      };
    },
    [],
  );

  // stable, so the camera does not restart on every refresh
  const check = useCallback(
    async (code: string): Promise<ScanResult> => {
      const { data: r, error } = await sb.rpc('helper_scan', { p_token: token, p_invite: code });
      if (error) return { error: 'network' };
      const out = r as {
        error?: string;
        already?: string | null;
        status: string;
        party_size: number;
        confirmed_count: number | null;
        guest_id: string;
        member_ids: string[];
      };
      if (out.error) return { error: out.error === 'helper' ? 'login' : out.error };
      // pick up the new arrival right away, then draw where to take them from the hall shapes we already have
      void load();
      return describe(
        {
          guest_id: out.guest_id,
          member_ids: out.member_ids,
          party_size: out.party_size,
          status: out.status,
          confirmed_count: out.confirmed_count,
        },
        out.already ?? null,
      );
    },
    [sb, token, load, describe],
  );

  async function mark(i: Inv, n: number, undo = false) {
    setBusy(true);
    await sb.rpc('helper_checkin', { p_token: token, p_invite: i.token, p_count: n, p_undo: undo });
    setOpen(null);
    await load();
    setBusy(false);
  }

  async function addWalkin(e: React.FormEvent) {
    e.preventDefault();
    if (!walk.name.trim()) return;
    setBusy(true);
    const { data: r } = await sb.rpc('helper_add_walkin', { p_token: token, p_name: walk.name, p_count: walk.n });
    setBusy(false);
    const res = r as { ok?: boolean; error?: string } | null;
    if (res?.ok) {
      setMsg(s('helperWalkinDone'));
      setWalk({ name: '', n: 1 });
      await load();
    } else setMsg(res?.error === 'full' ? s('helperWalkinFull') : s('genericError'));
  }

  if (dead) return <p className="notice err">{s('helperOffline')}</p>;
  if (!data) return <p className="muted">…</p>;

  const needle = q.trim().toLowerCase();
  const rows = data.invites
    .map((i) => ({ i, name: nameOf.get(i.guest_id) ?? '' }))
    .filter((r) => r.name && (!needle || r.name.toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const arrived = data.invites.filter((i) => i.checked_in_at).length;

  return (
    <div className="helper">
      <p className="muted">{s('helperArrivedCount', { n: arrived, total: data.invites.length })}</p>
      <div className="seg" role="tablist">
        {(['scan', 'names'] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? 'on' : ''}
            onClick={() => setTab(k)}
          >
            {k === 'scan' ? s('helperScanTab') : s('helperListTab')}
          </button>
        ))}
      </div>
      {tab === 'scan' && <Scanner check={check} />}
      {tab === 'names' && (
        <>
          <input
            className="field-input helper-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={s('helperSearch')}
            aria-label={s('helperSearch')}
          />
          <ul className="inv-list">
            {rows.slice(0, 60).map(({ i, name }) => (
              <li key={i.token} className="inv">
                <div className="helper-top">
                  <span className="num-sq">{i.confirmed_count ?? i.party_size}</span>
                  <b>{name}</b>
                </div>
                <div className="helper-btns">
                  {(() => {
                    const ids = [i.guest_id, ...i.member_ids];
                    const f = layout ? buildFocus(layout, ids) : null;
                    const text = layout
                      ? seatsSummary(
                          layout,
                          ids,
                          (table, n, chairs) =>
                            s('tableChairs', { table, word: n === 1 ? s('chairOne') : s('chairMany'), chairs }),
                          s('andWord'),
                        )
                      : '';
                    return f && layout ? (
                      <ZoomPan
                        label={text || s('tableOnly', { table: f.table })}
                        map={{ layout: { ...layout, guests: [] }, focus: f }}
                      />
                    ) : (
                      <span className="btn zp-open" aria-disabled>
                        {s('noTableYet')}
                      </span>
                    );
                  })()}
                  <button
                    className={`btn${i.checked_in_at ? ' arrived-on' : ''}`}
                    aria-expanded={open?.token === i.token}
                    onClick={() =>
                      setOpen(open?.token === i.token ? null : { token: i.token, n: i.confirmed_count ?? i.party_size })
                    }
                  >
                    {s('markArrived')}
                  </button>
                </div>
                {open?.token === i.token && (
                  <div className="arr-panel" role="group" aria-label={s('arrivedHowMany')}>
                    <span>{s('arrivedHowMany')}</span>
                    <span className="stepper">
                      <button
                        type="button"
                        aria-label="−"
                        disabled={open.n <= 1}
                        onClick={() => setOpen({ ...open, n: open.n - 1 })}
                      >
                        −
                      </button>
                      <output>{open.n}</output>
                      <button
                        type="button"
                        aria-label="+"
                        disabled={open.n >= 50}
                        onClick={() => setOpen({ ...open, n: open.n + 1 })}
                      >
                        +
                      </button>
                    </span>
                    <button className="btn small primary" disabled={busy} onClick={() => mark(i, open.n)}>
                      {i.checked_in_at ? s('save') : s('arrivedSave')}
                    </button>
                    {i.checked_in_at && (
                      <button className="btn small danger" disabled={busy} onClick={() => mark(i, 1, true)}>
                        {s('undoArrived')}
                      </button>
                    )}
                    <button className="btn small" onClick={() => setOpen(null)}>
                      {s('cancel')}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {rows.length === 0 && <p className="empty">{s('noMatches')}</p>}
        </>
      )}

      <form className="card-box helper-walk" onSubmit={addWalkin}>
        <h2>{s('helperWalkin')}</h2>
        <div className="walk-row">
          <input
            className="num-sq-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            value={walk.n}
            onChange={(e) =>
              setWalk({ ...walk, n: Math.min(50, Math.max(1, Number.parseInt(e.target.value, 10) || 1)) })
            }
            aria-label={s('helperHowMany')}
          />
          <input
            className="field-input"
            value={walk.name}
            maxLength={56}
            onChange={(e) => {
              setMsg('');
              setWalk({ ...walk, name: e.target.value });
            }}
            placeholder={s('helperWalkinName')}
            aria-label={s('helperWalkinName')}
          />
        </div>
        <button className="btn primary" disabled={busy || !walk.name.trim()}>
          {s('helperWalkinAdd')}
        </button>
        {msg && (
          <p className="muted" role="status">
            {msg}
          </p>
        )}
      </form>
    </div>
  );
}
