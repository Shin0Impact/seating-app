'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseLayout } from '@/lib/layout';
import { browserClient } from '@/lib/supabase/browser';
import { Icon } from './Icon';
import { useS } from './LangProvider';

/** Replaces the saved hall (tables and guests) with a hall file exported from the editor. */
export default function HallFileImport({ id, hasHall }: { id: string; hasHall: boolean }) {
  const s = useS();
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
      const { data, error } = await sb
        .from('events')
        .update({ layout, version: cur.version + 1, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('version', cur.version)
        .select('version');
      if (error || !data?.length) throw new Error('save');
      setMsg({ ok: true, text: s('hallImported') });
      setFile(null);
      router.refresh();
    } catch {
      setMsg({ ok: false, text: s('hallImportFailed') });
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
      <button className="btn" disabled={busy} onClick={() => ref.current?.click()}>
        <Icon name="upload" size={18} /> {busy ? s('importing') : s('importHall')}
      </button>
      <span className="muted">{s('importHallHint')}</span>
      {file && (
        <div
          className="notice err"
          role="alert"
          style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
        >
          <span>{s('importHallConfirm', { file: file.name })}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            <button className="btn danger-fill" onClick={() => run(file)}>
              {s('yesReplace')}
            </button>
            <button
              className="btn"
              onClick={() => {
                setFile(null);
                if (ref.current) ref.current.value = '';
              }}
            >
              {s('cancel')}
            </button>
          </span>
        </div>
      )}
      {msg && (
        <p className={`notice ${msg.ok ? 'ok' : 'err'}`} role="status">
          {msg.text}
        </p>
      )}
    </section>
  );
}
