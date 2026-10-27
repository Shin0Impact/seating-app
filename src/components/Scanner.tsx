'use client';

import jsQR from 'jsqr';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isToken } from '@/lib/invites';

type Result = { ok: true; already: string | null; status: string; partySize: number; confirmedCount: number | null; placements: { name: string; table: string | null; seat: number | null }[] } | { error: string };

const tokenFrom = (text: string) => text.trim().split(/[/?#]/).filter(Boolean).pop() ?? '';

export default function Scanner() {
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
      const r = await fetch('/api/checkin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
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
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        const v = video.current;
        if (!v || stop) return;
        v.srcObject = stream;
        await v.play();
        setCam('on');
        const tick = () => {
          if (stop) return;
          if (v.videoWidth && ctx && !lock.current) {
            const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w);
            canvas.width = w; canvas.height = h;
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
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [submit]);

  const ok = res && 'ok' in res ? res : null;
  const err = res && 'error' in res ? res.error : null;
  return (
    <div className="card-box">
      <video ref={video} playsInline muted className="scan-video" />
      {cam === 'off' && <p className="notice err">تعذّر تشغيل الكاميرا. اسمح بالوصول أو الصق الرمز يدويًا.</p>}
      <form style={{ display: 'flex', gap: 8 }} onSubmit={(e) => { e.preventDefault(); void submit(manual); setManual(''); }}>
        <input className="field-input" style={{ flex: 1, minHeight: 44, padding: '0 12px', border: '1px solid var(--line)', borderRadius: 10 }} value={manual} onChange={(e) => setManual(e.target.value)} placeholder="الصق رابط الدعوة أو الرمز" dir="ltr" />
        <button className="btn">تحقّق</button>
      </form>
      {err && <div className="scan-result bad" role="alert">{err === 'not_found' ? 'رمز غير معروف لهذه المناسبة' : err === 'login' ? 'سجّل الدخول من جديد' : 'خطأ، حاول مرة أخرى'}</div>}
      {ok && (
        <div className={`scan-result ${ok.already ? 'warn' : ok.status === 'confirmed' ? 'good' : 'warn'}`} role="status">
          {ok.already && <p className="scan-flag">⚠ تم تسجيل دخوله سابقًا ({new Date(ok.already).toLocaleTimeString('ar')})</p>}
          {!ok.already && ok.status !== 'confirmed' && <p className="scan-flag">⚠ لم يؤكّد حضوره مسبقًا</p>}
          <p className="muted">العدد: {ok.confirmedCount ?? ok.partySize} من {ok.partySize}</p>
          <ul>
            {ok.placements.map((p, i) => (
              <li key={i}><b>{p.name}</b><span className="where">{p.table ? `${p.table}${p.seat ? ` · كرسي ${p.seat}` : ''}` : 'بدون طاولة بعد'}</span></li>
            ))}
          </ul>
          <button className="btn primary" onClick={() => setRes(null)}>التالي</button>
        </div>
      )}
    </div>
  );
}
