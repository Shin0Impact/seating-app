'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseLayout } from '@/lib/layout';
import { browserClient } from '@/lib/supabase/browser';
import { Icon } from './Icon';

/** Replaces the saved hall (tables and guests) with a hall file exported from the editor. */
export default function HallFileImport({ id, hasHall }: { id: string; hasHall: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(f: File) {
    setBusy(true);
    setMsg(null);
    try {
      if (f.size > 2_000_000) throw new Error('big');
      const layout = parseLayout(JSON.parse(await f.text()));
      const sb = browserClient();
      const { data: cur, error: e1 } = await sb.from('events').select('version').eq('id', id).single();
      if (e1 || !cur) throw new Error('read');
      const { data, error } = await sb.from('events').update({ layout, version: cur.version + 1, updated_at: new Date().toISOString() }).eq('id', id).eq('version', cur.version).select('version');
      if (error || !data?.length) throw new Error('save');
      setMsg({ ok: true, text: 'تم استيراد المخطط.' });
      setFile(null);
      router.refresh();
    } catch {
      setMsg({ ok: false, text: 'تعذّر استيراد الملف. استخدم ملف مخطط (JSON) صدّرته من المحرر، بحجم أقل من 2 ميغابايت.' });
      setFile(null);
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = '';
    }
  }

  function pick(f: File | undefined) {
    if (!f) return;
    if (hasHall) setFile(f);
    else void run(f);
  }

  return (
    <section className="hall-import">
      <input ref={ref} type="file" accept="application/json,.json" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button className="btn" disabled={busy} onClick={() => ref.current?.click()}><Icon name="upload" size={18} /> {busy ? 'جارٍ الاستيراد…' : 'استيراد مخطط من ملف'}</button>
      <span className="muted">ملف JSON صدّرته من المحرر. يستبدل الطاولات والضيوف الحاليين.</span>
      {file && (
        <div className="notice err" role="alert" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span>سيُستبدل المخطط الحالي بالكامل بـ «{file.name}». متابعة؟</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn danger-fill" onClick={() => run(file)}>نعم، استبدل</button>
            <button className="btn" onClick={() => { setFile(null); if (ref.current) ref.current.value = ''; }}>إلغاء</button>
          </span>
        </div>
      )}
      {msg && <p className={`notice ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.text}</p>}
    </section>
  );
}
