'use client';

import jsQR from 'jsqr';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isToken } from '@/lib/invites';
import { useLang, useS } from './LangProvider';
import { localeOf } from '@/lib/site-i18n';
import HallPreview from './HallPreview';
import type { Focus } from '@/lib/route';
import type { Layout } from '@/lib/layout';

type Result =
  | {
      ok: true;
      already: string | null;
      status: string;
      partySize: number;
      confirmedCount: number | null;
      placements: { name: string; table: string | null; seat: number | null }[];
      plan: Pick<Layout, 'settings' | 'elements'>;
      focus: Focus | null;
    }
  | { error: string };

const tokenFrom = (text: string) => text.trim().split(/[/?#]/).filter(Boolean).pop() ?? '';

export default function Scanner() {
  const s = useS();
  const { lang } = useLang();
  const video = useRef<HTMLVideoElement>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [cam, setCam] = useState<'starting' | 'on' | 'off'>('starting');
  const [manual, setManual] = useState('');
  const lock = useRef(false);
  const lastTok = useRef({ t: '', at: 0 });

  const submit = useCallback(async (raw: string) => {
    const token = tokenFrom(raw);
    if (!isToken(token)) return;
    const now = Date.now();
    if (lock.current || (lastTok.current.t === token && now - lastTok.current.at < 4000)) return;
    lock.current = true;
    lastTok.current = { t: token, at: now };
    try {
      const r = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      setRes((await r.json()) as Result);
      navigator.vibrate?.(r.ok ? 80 : [60, 60, 60]);
    } catch {
      setRes({ error: 'network' });
    }
    lock.current = false;
  }, []);

  useEffect(() => {
    let stop = false;
    let stream: MediaStream | null = null;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        const v = video.current;
        if (!v || stop) return;
        v.srcObject = stream;
        await v.play();
        setCam('on');
        const tick = () => {
          if (stop) return;
          if (v.videoWidth && ctx && !lock.current) {
            const w = Math.min(720, v.videoWidth),
              h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w;
            canvas.height = h;
            ctx.drawImage(v, 0, 0, w, h);
            const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h);
            if (code) void submit(code.data);
          }
          setTimeout(tick, 150);
        };
        tick();
      } catch {
        setCam('off');
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [submit]);

  const ok = res && 'ok' in res ? res : null;
  const err = res && 'error' in res ? res.error : null;
  return (
    <div className="scan-grid">
      <div className="card-box">
        <video ref={video} playsInline muted className="scan-video" />
        {cam === 'off' && <p className="notice err">{s('cameraFailed')}</p>}
        <form
          style={{ display: 'flex', gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(manual);
            setManual('');
          }}
        >
          <input
            className="field-input"
            style={{ flex: 1, minHeight: 44, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 10 }}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder={s('pasteCode')}
            dir="ltr"
          />
          <button className="btn">{s('verify')}</button>
        </form>
      </div>
      <div className="scan-side">
        {err && (
          <div className="scan-result bad" role="alert">
            {err === 'not_found' ? s('unknownCode') : err === 'login' ? s('signInAgain') : s('genericError')}
          </div>
        )}
        {ok && (
          <div
            className={`scan-result ${ok.already ? 'warn' : ok.status === 'confirmed' ? 'good' : 'warn'}`}
            role="status"
          >
            {ok.already && (
              <p className="scan-flag">
                {s('alreadyIn', { time: new Date(ok.already).toLocaleTimeString(localeOf(lang)) })}
              </p>
            )}
            {!ok.already && ok.status !== 'confirmed' && <p className="scan-flag">{s('notConfirmed')}</p>}
            <p className="muted">{s('countLine', { n: ok.confirmedCount ?? ok.partySize, size: ok.partySize })}</p>
            <ul>
              {ok.placements.map((p, i) => (
                <li key={i}>
                  <b>{p.name}</b>
                  <span className="where">
                    {p.table ? `${p.table}${p.seat ? s('chairN', { n: p.seat }) : ''}` : s('noTableYet')}
                  </span>
                </li>
              ))}
            </ul>
            {ok.focus && (
              <div className="where-map">
                <HallPreview
                  layout={{ version: 1, settings: ok.plan.settings, elements: ok.plan.elements, guests: [] }}
                  label={s('whereTitle')}
                  focus={ok.focus}
                />
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  {ok.focus.route ? s('routeLegend') : s('noRouteHint')}
                </p>
              </div>
            )}
            <button className="btn primary" onClick={() => setRes(null)}>
              {s('next')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
