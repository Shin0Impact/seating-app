'use client';

import { useState } from 'react';
import { LIMITS, Settings, TableEl, tableDims, tableFootprint } from '@/lib/layout';
import { Key } from '@/lib/i18n';
import { IconButton } from './Icon';
import { NumField, round2 } from './NumField';

type Props = {
  t: (k: Key) => string;
  settings: Settings;
  tables: TableEl[];
  seated: Map<string, number>;
  onSettings: (patch: Partial<Settings>, key: string) => void;
  onPatchTable: (id: string, patch: Partial<TableEl>, key: string) => void;
  onSeats: (id: string, seats: number) => void;
  onAllSeats: (seats: number) => void;
  onLocate: (id: string) => void;
  onRemove: (id: string) => void;
};

/** Full-page table metrics: the sizing rules, and every table's name, shape and chair count. */
export function TablesView({ t, settings, tables, seated, onSettings, onPatchTable, onSeats, onAllSeats, onLocate, onRemove }: Props) {
  const [all, setAll] = useState(10);

  const sample = (shape: 'round' | 'rect', seats: number) => {
    const probe: TableEl = { id: 'x', kind: 'table', x: 0, y: 0, rotation: 0, label: '', shape, seats };
    const d = tableDims(probe, settings);
    const f = tableFootprint(probe, settings);
    const size = d.shape === 'round' ? `⌀ ${round2(d.diameter)} m` : `${round2(d.length)} × ${round2(d.width)} m`;
    const withChairs = f.type === 'circle' ? `${round2(f.r * 2)} m` : `${round2(f.w)} × ${round2(f.h)} m`;
    return { size, withChairs };
  };

  return (
    <div className="page">
      <div className="page-inner">
        <section className="card">
          <h2>{t('settings')}</h2>
          <p className="muted">{t('sizeHelp')}</p>
          <div className="settings-grid">
            <NumField label={t('seatWidth')} value={settings.seatWidth} min={0.3} max={1.5} step={0.05} onChange={(v) => onSettings({ seatWidth: v }, 'sw')} />
            <NumField label={t('chairDepth')} value={settings.chairDepth} min={0} max={1.5} step={0.05} onChange={(v) => onSettings({ chairDepth: v }, 'cd')} />
            <NumField label={t('rectWidth')} value={settings.rectTableWidth} min={0.3} max={3} step={0.05} onChange={(v) => onSettings({ rectTableWidth: v }, 'rw')} />
            <NumField label={t('walkway')} value={settings.walkway} min={0} max={3} step={0.05} onChange={(v) => onSettings({ walkway: v }, 'ww')} />
          </div>
          <h3 className="sub">{t('sizeExamples')}</h3>
          <div className="examples">
            {([['round', 8], ['round', 10], ['round', 12], ['rect', 8], ['rect', 10], ['rect', 12]] as const).map(([shape, n]) => {
              const s = sample(shape, n);
              return (
                <div key={`${shape}${n}`} className="example">
                  <b>
                    {t(shape === 'round' ? 'shapeRound' : 'shapeRect')} · {n} {t('chairs')}
                  </b>
                  <span>{t('tableSize')}: {s.size}</span>
                  <span>{t('withChairs')}: {s.withChairs}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="list-head">
            <h2>{t('tablesList')}</h2>
            <p className="totals">{tables.length}</p>
          </div>
          {tables.length === 0 && <p className="muted">{t('noTables')}</p>}
          {tables.length > 0 && (
            <>
              <div className="bulk">
                <NumField label={t('allChairs')} value={all} min={LIMITS.seatsMin} max={LIMITS.seatsMax} step={1} int onChange={setAll} />
                <button onClick={() => onAllSeats(all)}>{t('apply')}</button>
              </div>
              <div className="trow thead" aria-hidden>
                <span>{t('name')}</span>
                <span>{t('shape')}</span>
                <span>{t('chairs')}</span>
                <span>{t('tableSize')}</span>
                <span>{t('guestsTotal')}</span>
                <span />
                <span />
              </div>
              <ul className="tlist">
                {tables.map((tb) => {
                  const d = tableDims(tb, settings);
                  const n = seated.get(tb.id) ?? 0;
                  return (
                    <li key={tb.id} className="trow">
                      <input type="text" maxLength={LIMITS.labelMax} value={tb.label} aria-label={t('name')} onChange={(e) => onPatchTable(tb.id, { label: e.target.value }, 'label')} />
                      <select value={tb.shape} aria-label={t('shape')} onChange={(e) => onPatchTable(tb.id, { shape: e.target.value as 'round' | 'rect' }, 'shape')}>
                        <option value="round">{t('shapeRound')}</option>
                        <option value="rect">{t('shapeRect')}</option>
                      </select>
                      <NumField label={t('chairs')} hideLabel value={tb.seats} min={LIMITS.seatsMin} max={LIMITS.seatsMax} step={1} int onChange={(v) => onSeats(tb.id, v)} />
                      <span className="tsize">{d.shape === 'round' ? `⌀ ${round2(d.diameter)} m` : `${round2(d.length)} × ${round2(d.width)} m`}</span>
                      <span className={n > tb.seats ? 'over' : ''}>{n}/{tb.seats}</span>
                      <IconButton icon="fit" label={t('showInHall')} onClick={() => onLocate(tb.id)} />
                      <IconButton icon="trash" label={t('remove')} danger onClick={() => onRemove(tb.id)} />
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
