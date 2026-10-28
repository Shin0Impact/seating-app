'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImportGuests } from './ImportGuests';
import { STRINGS } from '@/lib/i18n';
import { Guest, Layout, TableEl, placeNewTables } from '@/lib/layout';
import { browserClient } from '@/lib/supabase/browser';

const t = (k: keyof typeof STRINGS.ar) => STRINGS.ar[k];

/** The optional "import your guest list" step. Saves into the event with the same version check as the hall editor. */
export default function ImportStep({ id, initial, version }: { id: string; initial: Layout; version: number }) {
  const router = useRouter();
  const [layout, setLayout] = useState(initial);
  const ver = useRef(version);
  const imported = useRef(false);
  const [round, setRound] = useState(0);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  async function onImport(added: Guest[], made: TableEl[]) {
    imported.current = true;
    const next: Layout = { ...layout, elements: [...layout.elements, ...placeNewTables(layout.elements, layout.settings, made)], guests: [...layout.guests, ...added] };
    const { data, error } = await browserClient()
      .from('events')
      .update({ layout: next, version: ver.current + 1, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('version', ver.current)
      .select('version');
    if (error) return setMsg({ kind: 'err', text: 'تعذّر الحفظ: ' + error.message });
    if (!data || data.length === 0) return setMsg({ kind: 'err', text: 'تم تعديل هذه المناسبة من مكان آخر. أعد تحميل الصفحة ثم حاول مجددًا.' });
    ver.current = data[0].version;
    setLayout(next);
    const seated = added.filter((g) => g.tableId).length;
    setMsg({ kind: 'ok', text: `تمت إضافة ${added.length} ضيفًا${made.length ? ` وإنشاء ${made.length} طاولة` : ''}${seated ? ` (أُجلس ${seated})` : ''}.` });
    setRound((r) => r + 1);
    imported.current = false;
  }

  return (
    <div className="card-box">
      {msg && (
        <div className={`notice ${msg.kind}`} role="status">
          {msg.text}
          {msg.kind === 'ok' && (
            <>
              {' '}
              <Link href={`/events/${id}/preview`}>افتح المخطط</Link> · <Link href={`/events/${id}/invites`}>الدعوات</Link>
            </>
          )}
        </div>
      )}
      <p className="muted" style={{ margin: 0 }}>
        يمكنك تخطي هذه الخطوة وإضافة الضيوف من المخطط مباشرةً. عمود الطاولة في الملف يُجلس الضيوف تلقائيًا إن وُجدت الطاولة (مثل «طاولة 12»)، أو يُنشئها لك.
      </p>
      <ImportGuests
        key={round}
        inline
        t={t}
        guests={layout.guests}
        tables={layout.elements.filter((e): e is TableEl => e.kind === 'table')}
        onImport={(a, m) => void onImport(a, m)}
        onClose={() => {
          if (!imported.current) router.push(`/events/${id}`);
        }}
      />
      <div className="row" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link className="btn" href={`/events/${id}`}>تخطي — الرجوع إلى المناسبة</Link>
        <Link className="btn primary" href={`/events/${id}/preview`}>المتابعة إلى المخطط</Link>
      </div>
    </div>
  );
}
