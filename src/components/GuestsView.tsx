'use client';

import { useMemo, useRef, useState } from 'react';
import { Guest, LIMITS, TableEl, firstFreeSeat, newGuest, seatGuest, seatedCounts } from '@/lib/layout';
import { Key } from '@/lib/i18n';
import { PLUS } from '@/lib/invites';
import { matches } from '@/lib/search';
import { Icon, IconButton } from './Icon';
import { ImportGuests } from './ImportGuests';

type Props = {
  t: (k: Key) => string;
  guests: Guest[];
  tables: TableEl[];
  onChange: (guests: Guest[], key?: string) => void;
  /** When set, the trash button asks the parent (which shows a confirmation) instead of deleting at once. */
  onAskRemove?: (id: string) => void;
  /** Teardrop button on seated guests: open the hall zoomed on their chair. */
  onLocate?: (g: Guest) => void;
  onImportAll?: (added: Guest[], newTables: TableEl[]) => void;
};

type Filter = 'all' | 'unseated' | 'seated';

/** Full-page guest list: look through it, search, add, edit and import. */
export function GuestsView({ t, guests, tables, onChange, onAskRemove, onLocate, onImportAll }: Props) {
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [tableId, setTableId] = useState('');
  const [stepFree, setStepFree] = useState(false);
  const [extra, setExtra] = useState(0);
  const [several, setSeveral] = useState(false);
  const [bulk, setBulk] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [groupFilter, setGroupFilter] = useState('');
  const [importing, setImporting] = useState(false);
  const [askDeleteAll, setAskDeleteAll] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => seatedCounts(guests), [guests]);
  const tableById = useMemo(() => new Map(tables.map((tb) => [tb.id, tb])), [tables]);
  const groups = useMemo(() => [...new Set(guests.map((g) => g.group).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [guests]);
  const room = LIMITS.maxGuests - guests.length;
  const seatedTotal = guests.filter((g) => g.tableId).length;

  const visible = useMemo(
    () =>
      guests
        .map((g, i) => ({ g, i }))
        .filter(({ g }) => (filter === 'all' ? true : filter === 'seated' ? !!g.tableId : !g.tableId))
        .filter(({ g }) => !groupFilter || g.group === groupFilter)
        .filter(({ g }) => matches(query, g.name, g.group, g.tableId ? tableById.get(g.tableId)?.label ?? '' : '')),
    [guests, filter, groupFilter, query, tableById],
  );

  const addGuests = (names: string[]) => {
    const tb = tableId ? tableById.get(tableId) : undefined;
    let next = guests;
    for (const n of names) {
      const g = newGuest(n, group, tb ? tb.id : null, stepFree);
      g.seat = tb ? firstFreeSeat(tb, next) : null;
      next = [...next, g];
    }
    onChange(next);
  };
  const addOne = () => {
    if (!name.trim() || room <= 0) return;
    // "Sami +3" or "Sami+3" in the name box means Sami and three more
    const typed = PLUS.exec(name.trim());
    const n = Math.min(Math.max(0, typed ? Number(typed[2]) : Math.floor(extra) || 0), 99, room - 1);
    const base = (typed ? typed[1] : name.trim()).slice(0, LIMITS.nameMax - 5);
    addGuests([base, ...Array.from({ length: n }, (_, i) => `${base} +${i + 1}`)]);
    setName('');
    setExtra(0);
    nameRef.current?.focus();
  };
  const addMany = () => {
    const lines = bulk
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, Math.max(0, room));
    if (lines.length === 0) return;
    addGuests(lines);
    setBulk('');
  };

  const update = (id: string, patch: Partial<Guest>, key: string) =>
    onChange(
      guests.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      `guest:${id}:${key}`,
    );
  const remove = (id: string) => onChange(guests.filter((g) => g.id !== id));

  const tableOption = (tb: TableEl) => (
    <option key={tb.id} value={tb.id}>
      {tb.label} ({counts.get(tb.id) ?? 0}/{tb.seats})
    </option>
  );

  return (
    <div className="page">
      <div className="page-inner guests">
        <section className="card">
          <h2>{t('addGuestCard')}</h2>
          <form
            className="add-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (several) addMany();
              else addOne();
            }}
          >
            {!several ? (
              <label className="field af-name">
                <span>{t('guestName')}</span>
                <input ref={nameRef} type="text" maxLength={LIMITS.nameMax} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
              </label>
            ) : (
              <label className="field af-name" style={{ gridColumn: 'span 2' }}>
                <span>{t('severalHint')}</span>
                <textarea rows={5} value={bulk} onChange={(e) => setBulk(e.target.value)} />
              </label>
            )}
            {!several && (
              <label className="field af-extra">
                <span>{t('extraPeople')}</span>
                <input type="number" inputMode="numeric" min={0} max={99} value={extra || ''} placeholder="0" onChange={(e) => setExtra(Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)))} />
              </label>
            )}
            <label className="field af-group">
              <span>{t('guestGroup')}</span>
              <input type="text" list="group-list" maxLength={LIMITS.groupMax} value={group} onChange={(e) => setGroup(e.target.value)} autoComplete="off" />
              <datalist id="group-list">
                {groups.map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </label>
            <label className="field af-table">
              <span>{t('table')}</span>
              <select value={tableId} onChange={(e) => setTableId(e.target.value)}>
                <option value="">{t('unseated')}</option>
                {tables.map(tableOption)}
              </select>
            </label>
            <label className="check af-step">
              <input type="checkbox" checked={stepFree} onChange={(e) => setStepFree(e.target.checked)} />
              <span>{t('stepFree')}</span>
            </label>
            <div className="af-actions">
              <button type="submit" className="primary" disabled={room <= 0 || (several ? !bulk.trim() : !name.trim())}>
                <Icon name="plus" size={18} /> {several ? t('addAll') : t('addGuest')}
              </button>
              <button type="button" onClick={() => setSeveral(!several)}>
                {several ? t('addGuest') : t('addSeveral')}
              </button>
              <button type="button" className="import-btn" onClick={() => setImporting(true)}>
                <Icon name="upload" size={18} /> {t('importGuests')}
              </button>
            </div>
          </form>
          {importing && <ImportGuests t={t} guests={guests} tables={tables} onImport={(added, made) => (onImportAll && made.length ? onImportAll(added, made) : onChange([...guests, ...added]))} onClose={() => setImporting(false)} />}
        </section>

        <section className="card">
          <div className="list-head">
            <h2>{t('guestListTitle')}</h2>
            <p className="totals">
              {t('guestsTotal')}: {guests.length} · {t('seated')}: {seatedTotal} · {t('noTable')}: {guests.length - seatedTotal}
            </p>
          </div>
          {guests.length > 0 && (
            <div className="row delete-all">
              {!askDeleteAll ? (
                <button type="button" onClick={() => setAskDeleteAll(true)}>
                  <Icon name="trash" size={18} /> {t('deleteAllGuests')}
                </button>
              ) : (
                <>
                  <span className="error">{t('confirmDeleteAll')} ({guests.length})</span>
                  <button type="button" className="primary danger-fill" onClick={() => { onChange([]); setAskDeleteAll(false); }}>
                    {t('deleteAllGuests')}
                  </button>
                  <button type="button" onClick={() => setAskDeleteAll(false)}>{t('importCancel')}</button>
                </>
              )}
            </div>
          )}
          <div className="filters">
            <label className="search">
              <Icon name="search" size={18} />
              <input type="search" placeholder={t('searchGuests')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('searchGuests')} />
            </label>
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label={t('filterAll')}>
              <option value="all">{t('filterAll')}</option>
              <option value="unseated">{t('filterUnseated')}</option>
              <option value="seated">{t('filterSeated')}</option>
            </select>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label={t('groupAll')}>
              <option value="">{t('groupAll')}</option>
              {groups.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {guests.length === 0 && <p className="muted">{t('noGuests')}</p>}
          {guests.length > 0 && visible.length === 0 && <p className="muted">{t('noMatches')}</p>}

          {visible.length > 0 && (
            <div className={`glist-head grow${onLocate ? ' pin' : ''}`} aria-hidden>
              <span>#</span>
              <span>{t('guestName')}</span>
              <span>{t('guestGroup')}</span>
              <span>{t('table')}</span>
              <span>{t('chair')}</span>
              <span />
              <span />
              {onLocate && <span />}
            </div>
          )}
          <ul className="guest-list glist">
            {visible.map(({ g, i }) => {
              const tb = g.tableId ? tableById.get(g.tableId) : undefined;
              return (
                <li key={g.id} className={`guest grow${onLocate ? ' pin' : ''}`}>
                  <span className="c-num muted">{i + 1}</span>
                  <div className="guest-top">
                    <input
                      type="text"
                      className="guest-name"
                      maxLength={LIMITS.nameMax}
                      value={g.name}
                      aria-label={t('guestName')}
                      onChange={(e) => update(g.id, { name: e.target.value }, 'name')}
                      onBlur={(e) => {
                        if (!e.target.value.trim()) remove(g.id);
                      }}
                    />
                  </div>
                  <div className="guest-bottom">
                    <input
                      type="text"
                      list="group-list"
                      maxLength={LIMITS.groupMax}
                      value={g.group}
                      placeholder={t('guestGroup')}
                      aria-label={t('guestGroup')}
                      onChange={(e) => update(g.id, { group: e.target.value }, 'group')}
                    />
                    <select
                      value={g.tableId ?? ''}
                      aria-label={t('table')}
                      onChange={(e) => {
                        const id = e.target.value;
                        const target = id ? tableById.get(id) : undefined;
                        onChange(seatGuest(guests, g.id, target ? target.id : null, target ? firstFreeSeat(target, guests, g.id) : null));
                      }}
                    >
                      <option value="">{t('unseated')}</option>
                      {tables.map(tableOption)}
                    </select>
                    {tb ? (
                      <select
                        value={g.seat ?? ''}
                        aria-label={t('chair')}
                        title={t('chair')}
                        onChange={(e) => onChange(seatGuest(guests, g.id, g.tableId, e.target.value === '' ? null : Number(e.target.value)))}
                      >
                        <option value="">–</option>
                        {Array.from({ length: tb.seats }, (_, k) => {
                          const other = guests.find((o) => o.id !== g.id && o.tableId === g.tableId && o.seat === k);
                          return (
                            <option key={k} value={k}>
                              {k + 1}
                              {other ? ` · ${other.name}` : ''}
                            </option>
                          );
                        })}
                      </select>
                    ) : (
                      <span />
                    )}
                  </div>
                  {onLocate && (g.tableId ? <IconButton icon="pin" label={t('showOnMap')} onClick={() => onLocate(g)} /> : <span />)}
                  <IconButton icon="access" label={t('stepFree')} pressed={g.stepFree} onClick={() => update(g.id, { stepFree: !g.stepFree }, 'step')} />
                  <IconButton icon="trash" label={t('removeGuest')} danger onClick={() => (onAskRemove ? onAskRemove(g.id) : remove(g.id))} />
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
