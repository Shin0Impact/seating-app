'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { browserClient } from '@/lib/supabase/browser';
import { parseLayout, type Layout } from '@/lib/layout';
import { formatRanges, locate, seatRanges } from '@/lib/invites';
import { buildFocus } from '@/lib/route';
import { useS } from './LangProvider';
import ZoomPan from './ZoomPan';
import Scanner, { type ScanResult } from './Scanner';
import {
  enqueue,
  forget,
  loadSaved,
  overlay,
  pendingInvites,
  saveData,
  saveQueue,
  type HelperData,
  type HelperInvite,
  type HelperOp,
} from '@/lib/helperOffline';

const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random());

type Inv = HelperInvite;
type Data = HelperData;

/** A queued tap was sent (ok), cannot ever succeed (drop), should be tried again later (retry), or the link is off. */
type Sent = 'ok' | 'drop' | 'retry' | 'dead';

/**
 * The door desk for helpers: no login, only the secret link. All access goes through token-checked database
 * functions. It keeps working on a weak or missing connection: the last list is kept on the phone, and taps are
 * queued and sent as soon as possible (with the time they were made).
 */
export default function HelperDesk({ token }: { token: string }) {
  const s = useS();
  const sb = useMemo(() => browserClient(), []);
  const [server, setServer] = useState<Data | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [queue, setQueueState] = useState<HelperOp[]>([]);
  const [reachable, setReachable] = useState(true);
  const [dead, setDead] = useState(false);
  const [tab, setTab] = useState<'scan' | 'names'>('scan');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<{ token: string; n: number } | null>(null);
  const [walk, setWalk] = useState({ name: '', n: 1 });
  const [msg, setMsg] = useState('');

  // the search sits in the top bar (always in view); typing in it opens the names list
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById('helper-search')), []);

  const queueRef = useRef<HelperOp[]>([]);
  const setQueue = useCallback(
    (next: HelperOp[]) => {
      queueRef.current = next;
      setQueueState(next);
      saveQueue(token, next);
    },
    [token],
  );

  // what this phone already has, shown at once (even with no signal)
  useEffect(() => {
    const saved = loadSaved(token);
    if (saved.data) setServer(saved.data);
    setSavedAt(saved.savedAt);
    queueRef.current = saved.queue;
    setQueueState(saved.queue);
  }, [token]);

  const load = useCallback(async () => {
    const { data: d, error } = await sb.rpc('helper_get', { p_token: token });
    if (error) {
      setReachable(false);
      return;
    }
    setReachable(true);
    if (!d) {
      forget(token);
      return setDead(true);
    }
    setDead(false);
    const at = new Date().toISOString();
    setServer(d as Data);
    setSavedAt(at);
    saveData(token, d as Data, at);
  }, [sb, token]);

  /** Call a database function; if the database has not been updated yet, use the older form of it. */
  const call = useCallback(
    async (fn: string, args: Record<string, unknown>, older: Record<string, unknown>) => {
      let r = await sb.rpc(fn, args);
      if (r.error && (r.error.code === 'PGRST202' || /could not find the function/i.test(r.error.message)))
        r = await sb.rpc(fn, older);
      return r;
    },
    [sb],
  );

  const send = useCallback(
    async (op: HelperOp): Promise<Sent> => {
      const r =
        op.kind === 'checkin'
          ? await call(
              'helper_checkin',
              { p_token: token, p_invite: op.invite, p_count: op.count, p_undo: op.undo, p_at: op.at },
              { p_token: token, p_invite: op.invite, p_count: op.count, p_undo: op.undo },
            )
          : op.kind === 'scan'
            ? await call(
                'helper_scan',
                { p_token: token, p_invite: op.invite, p_at: op.at },
                { p_token: token, p_invite: op.invite },
              )
            : await call(
                'helper_add_walkin',
                { p_token: token, p_name: op.name, p_count: op.count, p_key: op.key, p_at: op.at },
                { p_token: token, p_name: op.name, p_count: op.count },
              );
      if (r.error) {
        // no answer, or the server is struggling: try again later; anything else will never work
        const st = (r as { status?: number }).status ?? 0;
        return st === 0 || st >= 500 || st === 408 || st === 429 ? 'retry' : 'drop';
      }
      const res = r.data as { ok?: boolean; error?: string } | null;
      if (res?.error === 'helper') return 'dead';
      if (res?.error === 'full') setMsg(s('helperWalkinFull'));
      return 'ok';
    },
    [call, token, s],
  );

  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || queueRef.current.length === 0) return;
    flushing.current = true;
    let sentAny = false;
    try {
      while (queueRef.current.length > 0) {
        const op = queueRef.current[0];
        const res = await send(op);
        if (res === 'retry') {
          setReachable(false);
          break;
        }
        if (res === 'dead') {
          forget(token);
          setDead(true);
          break;
        }
        setReachable(true);
        sentAny = true;
        // the queue may have changed while this was on its way: remove just this tap
        setQueue(queueRef.current.filter((x) => x.id !== op.id));
      }
    } finally {
      flushing.current = false;
    }
    if (sentAny) void load();
  }, [send, setQueue, load, token]);

  const push = useCallback(
    (op: HelperOp) => {
      setQueue(enqueue(queueRef.current, op));
      void flush();
    },
    [setQueue, flush],
  );

  useEffect(() => {
    void load().then(() => void flush());
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (queueRef.current.length > 0) void flush();
      else void load();
    }, 8000);
    const back = () => {
      void flush();
      void load();
    };
    window.addEventListener('online', back);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', back);
    };
  }, [load, flush]);

  /** The list as it will be once the queued taps are through. */
  const data = useMemo(() => (server ? overlay(server, queue) : null), [server, queue]);
  const waiting = useMemo(() => pendingInvites(queue), [queue]);

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

  // a scanned code is looked up on the phone first, so it works without signal; stable, so the camera keeps running
  const check = useCallback(
    async (code: string): Promise<ScanResult> => {
      const here = dataRef.current.data?.invites.find((i) => i.token === code);
      if (here) {
        if (!here.checked_in_at) push({ id: uid(), kind: 'scan', invite: code, at: new Date().toISOString() });
        return describe(here, here.checked_in_at);
      }
      // not on this phone's list (maybe added since): ask the server, if it can be reached
      const { data: r, error } = await call(
        'helper_scan',
        { p_token: token, p_invite: code, p_at: new Date().toISOString() },
        { p_token: token, p_invite: code },
      );
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
    [call, token, load, describe, push],
  );

  function mark(i: Inv, n: number, undo = false) {
    push({ id: uid(), kind: 'checkin', invite: i.token, count: n, undo, at: new Date().toISOString() });
    setOpen(null);
  }

  function addWalkin(e: React.FormEvent) {
    e.preventDefault();
    if (!walk.name.trim()) return;
    push({
      id: uid(),
      kind: 'walkin',
      key: crypto.randomUUID(),
      name: walk.name.trim().slice(0, 56),
      count: walk.n,
      at: new Date().toISOString(),
    });
    setMsg(reachable ? s('helperWalkinDone') : s('helperWalkinQueued'));
    setWalk({ name: '', n: 1 });
  }

  if (dead) return <p className="notice err">{s('helperOffline')}</p>;
  if (!data) return <p className="muted">{reachable ? '…' : s('helperNoData')}</p>;

  const needle = q.trim().toLowerCase();
  const rows = data.invites
    .map((i) => ({ i, name: nameOf.get(i.guest_id) ?? '' }))
    .filter((r) => r.name && (!needle || r.name.toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const arrived = data.invites.filter((i) => i.checked_in_at).length;
  const time = savedAt
    ? new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';

  const search = slot
    ? createPortal(
        <label className="search helper-search">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (e.target.value.trim()) setTab('names');
            }}
            placeholder={s('helperSearch')}
            aria-label={s('helperSearch')}
          />
        </label>,
        slot,
      )
    : null;

  return (
    <div className="helper">
      {search}
      <p className="muted">{s('helperArrivedCount', { n: arrived, total: data.invites.length })}</p>
      <p className={`helper-net${reachable ? '' : ' off'}`} role="status">
        <span className="dot" aria-hidden />
        {reachable ? s('helperOnline') : s('helperOfflineNow')}
        {queue.length > 0 && <b> · {s('helperPending', { n: queue.length })}</b>}
        {time && <span className="muted"> · {s('helperUpdated', { time })}</span>}
      </p>
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
          <ul className="inv-list">
            {rows.slice(0, 60).map(({ i, name }) => (
              <li key={i.token} className="inv">
                <div className="helper-top">
                  <span className="num-sq">{i.confirmed_count ?? i.party_size}</span>
                  <b>{name}</b>
                  {waiting.has(i.token) && (
                    <span className="helper-wait" title={s('helperWaitingOne')} aria-label={s('helperWaitingOne')}>
                      ⏳
                    </span>
                  )}
                </div>
                <div className="helper-btns">
                  {(() => {
                    const ids = [i.guest_id, ...i.member_ids];
                    // the walking route is worked out only when the map is opened (it is the slow part)
                    const at = layout ? locate(layout, ids).find((p) => p.tableId) : undefined;
                    // "طاولة 12 · 1-2": the table number in bold, then just the chair numbers
                    const seats = new Map<string, number[]>();
                    for (const g of layout?.guests ?? [])
                      if (ids.includes(g.id) && g.tableId && g.seat !== null)
                        seats.set(g.tableId, [...(seats.get(g.tableId) ?? []), g.seat + 1]);
                    const parts = [...seats.entries()].map(([tid, list]) => ({
                      table: layout?.elements.find((e) => e.id === tid)?.label ?? '',
                      chairs: formatRanges(seatRanges(list), s('andWord')),
                    }));
                    if (parts.length === 0 && at) parts.push({ table: at.table ?? '', chairs: '' });
                    const text = parts.map((p) => `${p.table}${p.chairs ? ` · ${p.chairs}` : ''}`).join(' | ');
                    return layout && at ? (
                      <ZoomPan
                        label={text}
                        content={
                          <span className="hz-where">
                            {parts.map((p, k) => (
                              <span key={k} className="hz-part">
                                <span className="hz-table">
                                  {p.table
                                    .split(/(\d+)/)
                                    .map((bit, j) => (/^\d+$/.test(bit) ? <b key={j}>{bit}</b> : bit))}
                                </span>
                                {p.chairs && (
                                  <span className="hz-dot" aria-hidden>
                                    ·
                                  </span>
                                )}
                                {p.chairs && (
                                  <span className="hz-chairs" dir="ltr">
                                    {p.chairs}
                                  </span>
                                )}
                              </span>
                            ))}
                          </span>
                        }
                        map={() => ({ layout: { ...layout, guests: [] }, focus: buildFocus(layout, ids) })}
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
                    <button className="btn small primary" onClick={() => mark(i, open.n)}>
                      {i.checked_in_at ? s('save') : s('arrivedSave')}
                    </button>
                    {i.checked_in_at && (
                      <button className="btn small danger" onClick={() => mark(i, 1, true)}>
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
        <button className="btn primary" disabled={!walk.name.trim()}>
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
