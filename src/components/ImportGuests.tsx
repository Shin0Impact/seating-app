'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Guest, TableEl } from '@/lib/layout';
import { Icon } from './Icon';
import { Key } from '@/lib/i18n';
import { looksLikeXlsx, xlsxToText } from '@/lib/xlsx';
import { IMPORT_LIMITS, Mapping, NO_COLUMN, buildGuests, decodeBytes, detectDelimiter, guessMapping, guessNameColumn, parseCsv } from '@/lib/csv';

type Props = {
  t: (k: Key) => string;
  guests: Guest[];
  tables: TableEl[];
  onImport: (added: Guest[], newTables: TableEl[]) => void;
  onClose: () => void;
};

/** Import guests from a CSV file or pasted spreadsheet cells, with a preview before anything is added. */
export function ImportGuests({ t, guests, tables, onImport, onClose }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [header, setHeader] = useState(true);
  const [over, setOver] = useState(false);
  const [createTables, setCreateTables] = useState(true);
  const [map, setMap] = useState<Mapping>({ name: NO_COLUMN, surname: NO_COLUMN, group: NO_COLUMN, count: NO_COLUMN, table: NO_COLUMN });
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => (text.trim() ? parseCsv(text, detectDelimiter(text)) : []), [text]);
  const cols = Math.max(0, ...rows.map((r) => r.length));

  // when new data arrives, guess the header row and columns
  useEffect(() => {
    if (rows.length === 0) return;
    const g = guessMapping(rows[0]);
    setHeader(g.foundHeader);
    setMap(g.foundHeader ? g.mapping : { name: guessNameColumn(rows), surname: NO_COLUMN, group: NO_COLUMN, count: NO_COLUMN, table: NO_COLUMN });
  }, [rows]);

  const data = header ? rows.slice(1) : rows;
  const colLabel = (i: number) => (header && rows[0]?.[i] ? `${i + 1}. ${rows[0][i]}` : `${i + 1}`);
  const result = useMemo(() => (map.name === NO_COLUMN ? null : buildGuests(data, map, guests, tables, createTables)), [data, map, guests, tables, createTables]);

  const load = async (file: File) => {
    setError('');
    try {
      if (file.size > IMPORT_LIMITS.bytes * 3) throw new Error('big');
      const buf = await file.arrayBuffer();
      if (looksLikeXlsx(buf)) setText((await xlsxToText(buf)).slice(0, IMPORT_LIMITS.bytes));
      else if (/\.xls$/i.test(file.name)) throw new Error('xls');
      else setText(decodeBytes(buf));
    } catch (e) {
      setError(t((e as Error).message === 'xls' ? 'importOldXls' : 'importBad'));
    }
  };

  const select = (key: keyof Mapping, optional: boolean, label: string) => (
    <label className="field">
      <span>{label}</span>
      <select value={map[key]} onChange={(e) => setMap({ ...map, [key]: Number(e.target.value) })}>
        {optional && <option value={NO_COLUMN}>{t('importNone')}</option>}
        {!optional && map[key] === NO_COLUMN && <option value={NO_COLUMN}>{t('importNone')}</option>}
        {Array.from({ length: cols }, (_, i) => (
          <option key={i} value={i}>{colLabel(i)}</option>
        ))}
      </select>
    </label>
  );

  return (
    <>
      <div className="picker-backdrop" onMouseDown={onClose} />
      <div className="import-dialog" role="dialog" aria-label={t('importGuests')} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <h3>{t('importGuests')}</h3>
        <p className="muted">{t('importIntro')}</p>
        <label
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void load(f);
          }}
        >
          <Icon name="upload" size={20} />
          <span>{t('importChooseCsv')}</span>
          <small>{t('importDropHint')}</small>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            data-testid="import-file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void load(f);
              e.target.value = '';
            }}
          />
        </label>
        <label className="field">
          <span>{t('importPaste')}</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value.slice(0, IMPORT_LIMITS.bytes))} dir="auto" />
        </label>
        {error && <p className="error" role="alert">{error}</p>}

        {rows.length > 0 && (
          <>
            <label className="check">
              <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />
              <span>{t('importFirstRow')}</span>
            </label>
            <div className="two">
              {select('name', false, t('importColName'))}
              {select('surname', true, t('importColSurname'))}
            </div>
            <div className="two">
              {select('group', true, t('importColGroup'))}
              {select('table', true, t('importColTable'))}
            </div>
            {map.table !== NO_COLUMN && (
              <label className="check">
                <input type="checkbox" checked={createTables} onChange={(e) => setCreateTables(e.target.checked)} />
                <span>{t('importCreateTables')}</span>
              </label>
            )}
            {select('count', true, t('importColCount'))}
            {map.count !== NO_COLUMN && <p className="muted">{t('importCountHint')}</p>}

            {map.name === NO_COLUMN && <p className="muted">{t('importNeedName')}</p>}
            {result && (
              <>
                <p className="totals">
                  {t('importWill')}: {result.people} {t('importPeople')}
                </p>
                <ul className="import-notes">
                  {result.skippedDuplicates > 0 && <li>{result.skippedDuplicates} {t('importDup')}</li>}
                  {result.skippedEmpty > 0 && <li>{result.skippedEmpty} {t('importEmpty')}</li>}
                  {result.newTables.length > 0 && <li>{result.newTables.length} {t('importTablesMade')}</li>}
                  {result.tablesMatched > 0 && <li>{result.tablesMatched} {t('importTables')}</li>}
                  {result.tablesUnmatched > 0 && <li>{result.tablesUnmatched} {t('importTablesMiss')}</li>}
                  {result.capped && <li>{t('importCapped')}</li>}
                </ul>
                <p className="muted">{t('importPreview')}</p>
                <ul className="import-preview" dir="auto">
                  {result.guests.slice(0, 8).map((g) => (
                    <li key={g.id}>
                      <b>{g.name}</b>
                      {g.group ? ` · ${g.group}` : ''}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        <div className="row">
          <button className="primary" disabled={!result || result.people === 0} onClick={() => result && (onImport(result.guests, result.newTables), onClose())}>
            {t('importDo')}
          </button>
          <button onClick={onClose}>{t('importCancel')}</button>
        </div>
      </div>
    </>
  );
}
