'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STRINGS } from '@/lib/i18n';
import { useLang, useS } from './LangProvider';
import { GuestsView, applyChanges } from './GuestsView';
import { Guest, Layout, TableEl, placeNewTables, settleLayout } from '@/lib/layout';
import { applyIncoming, useLayoutSync } from './useLayoutSync';
import { partyOf, removeParty } from '@/lib/party';
import { ConfirmDialog } from './editor/ConfirmDialog';

/** The guests step: the same guest list as the hall editor (add, edit, seat, import), saved into the event with the same version check. */
export default function GuestsStep({ id, initial, version }: { id: string; initial: Layout; version: number }) {
  const router = useRouter();
  const { lang } = useLang();
  const s = useS();
  const t = useCallback((k: keyof typeof STRINGS.ar) => STRINGS[lang][k], [lang]);
  const [layout, setLayout] = useState(initial);
  const [askRemove, setAskRemove] = useState<string | null>(null);
  const { status, incoming, onChange, saveNow, shown } = useLayoutSync(id, initial, version);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const commit = useCallback(
    (raw: Layout) => {
      const next = settleLayout(raw);
      layoutRef.current = next;
      setLayout(next);
      onChange(next);
    },
    [onChange],
  );

  // another device saved: show the merged list (keeping anything typed here since)
  useEffect(() => {
    if (!incoming) return;
    const next = applyIncoming(layoutRef.current, incoming);
    layoutRef.current = next;
    setLayout(next);
    shown(incoming.seq);
    onChange(next);
  }, [incoming, onChange, shown]);

  const tables = layout.elements.filter((e): e is TableEl => e.kind === 'table');
  const label = { saved: s('saved'), saving: s('saving'), error: s('saveError'), merged: s('syncedOther') }[status];

  return (
    <div className="guests-step">
      <p className={`save-status ${status}`} role="status" style={{ margin: 0 }}>
        {label}
      </p>
      <GuestsView
        t={t}
        guests={layout.guests}
        tables={tables}
        onChange={(guests: Guest[]) => commit({ ...layoutRef.current, guests })}
        onAskRemove={setAskRemove}
        onImportAll={(added, made, changes) => {
          const l = layoutRef.current;
          commit({
            ...l,
            elements: [...l.elements, ...placeNewTables(l.elements, l.settings, made)],
            guests: [...applyChanges(l.guests, changes), ...added],
          });
        }}
        onLocate={(g) => {
          void saveNow().then(() => router.push(`/events/${id}/hall?focus=${g.id}`));
        }}
      />
      {askRemove && (
        <ConfirmDialog
          label={t('removeGuest')}
          text={t('confirmRemoveGuest').replace(
            '{name}',
            (() => {
              const p = partyOf(layout.guests, askRemove);
              return p.length > 1 ? `${p[0].name} (+${p.length - 1})` : (p[0]?.name ?? '');
            })(),
          )}
          confirmLabel={t('removeGuest')}
          cancelLabel={t('importCancel')}
          onConfirm={() => {
            const gid = askRemove;
            setAskRemove(null);
            const l = layoutRef.current;
            commit({ ...l, guests: removeParty(l.guests, gid) });
          }}
          onCancel={() => setAskRemove(null)}
        />
      )}
    </div>
  );
}
