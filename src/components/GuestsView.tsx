'use client';

import { swallowRestOfPress } from '@/lib/touchdrag';
import { Fragment, useMemo, useRef, useState } from 'react';
import { planned, roles, setRole, type ExpectKind } from '@/lib/expect';
import { ExpectSteppers } from './ExpectSteppers';
import { Guest, LIMITS, TableEl, firstFreeSeat, newGuest, seatGuest, seatedCounts } from '@/lib/layout';
import { Key } from '@/lib/i18n';
import { PLUS, inviteDrafts } from '@/lib/invites';
import { patchGuest, removeParty, seatParty, setPartySize } from '@/lib/party';
import { matches } from '@/lib/search';
import { GroupInput } from './GroupInput';
import { Select } from './Select';
import { Icon, IconButton } from './Icon';
import { ImportGuests, type ImportChanges } from './ImportGuests';

type Props = {
  t: (k: Key) => string;
  guests: Guest[];
  tables: TableEl[];
  onChange: (guests: Guest[], key?: string) => void;
  /** When set, the trash button asks the parent (which shows a confirmation) instead of deleting at once. */
  onAskRemove?: (id: string) => void;
  /** Teardrop button on seated guests: open the hall zoomed on their chair. */
  onLocate?: (g: Guest) => void;
  onImportAll?: (added: Guest[], newTables: TableEl[], changes: ImportChanges) => void;
};

/** Applies the group / sure-maybe changes an import asked for to people already in the list. */
export const applyChanges = (guests: Guest[], c: ImportChanges) =>
  c.group.size + c.expect.size === 0
    ? guests
    : guests.map((g) => {
        const group = c.group.get(g.id);
        const expect = c.expect.get(g.id);
        return group === undefined && expect === undefined
          ? g
          : { ...g, ...(group === undefined ? {} : { group }), ...(expect === undefined ? {} : { expect }) };
      });

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
  const [expFilter, setExpFilter] = useState<'all' | ExpectKind>('all');
  const [groupFilter, setGroupFilter] = useState('');
  const [tableFilter, setTableFilter] = useState('');
  const nameBefore = useRef<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters =
    (filter !== 'all' ? 1 : 0) + (expFilter !== 'all' ? 1 : 0) + (tableFilter ? 1 : 0) + (groupFilter ? 1 : 0);
  const clearFilters = () => {
    setFilter('all');
    setExpFilter('all');
    setTableFilter('');
    setGroupFilter('');
  };
  const [importing, setImporting] = useState(false);
  const roleMap = useMemo(() => roles(guests), [guests]);
  const [adding, setAdding] = useState(false);
  const [justAdded, setJustAdded] = useState(0);
  const [askDeleteAll, setAskDeleteAll] = useState(false);
  const [typed, setTyped] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => seatedCounts(guests), [guests]);
  const tableById = useMemo(() => new Map(tables.map((tb) => [tb.id, tb])), [tables]);
  const groups = useMemo(
    () => [...new Set(guests.map((g) => g.group).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [guests],
  );
  const room = LIMITS.maxGuests - guests.length;
  const seatedTotal = guests.filter((g) => g.tableId).length;

  const visible = useMemo(
    () =>
      guests
        .map((g, i) => ({ g, i }))
        .filter(({ g }) => (filter === 'all' ? true : filter === 'seated' ? !!g.tableId : !g.tableId))
        .filter(({ g }) => !groupFilter || g.group === groupFilter)
        .filter(({ g }) => !tableFilter || g.tableId === tableFilter)
        .filter(({ g }) => matches(query, g.name, g.group, g.tableId ? (tableById.get(g.tableId)?.label ?? '') : '')),
    [guests, filter, groupFilter, tableFilter, query, tableById],
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
    setJustAdded((n) => n + names.length);
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

  // a new name or group for a named guest goes to their +1s too
  const update = (id: string, patch: Partial<Guest>, key: string) =>
    onChange(patchGuest(guests, id, patch), `guest:${id}:${key}`);
  const remove = (id: string) => onChange(removeParty(guests, id));

  const tableOption = (tb: TableEl) => (
    <option key={tb.id} value={tb.id}>
      {tb.label} ({counts.get(tb.id) ?? 0}/{tb.seats})
    </option>
  );

  const sizeOf = useMemo(() => new Map(inviteDrafts(guests).map((d) => [d.guestId, d.partySize])), [guests]);
  const roleCount = useMemo(() => {
    const n = { sure: 0, maybe: 0, court: 0 };
    for (const k of roleMap.values()) n[k] += 1;
    return n;
  }, [roleMap]);
  const rows = useMemo(() => {
    const out: { head: { g: Guest; i: number }; kids: { g: Guest; i: number }[] }[] = [];
    for (const v of visible) {
      const last = out[out.length - 1];
      if (PLUS.test(v.g.name) && last) last.kids.push(v);
      else out.push({ head: v, kids: [] });
    }
    if (expFilter === 'all') return out;
    const is = (id: string) => (roleMap.get(id) ?? 'sure') === expFilter;
    return out
      .map((r) => ({ head: r.head, kids: r.kids.filter((k) => is(k.g.id)) }))
      .filter((r) => is(r.head.g.id) || r.kids.length > 0);
  }, [visible, expFilter, roleMap]);

  const kidsSummary = (rs: ExpectKind[]) => {
    const n = (k: ExpectKind) => rs.filter((x) => x === k).length;
    return [
      n('sure') ? `${t('expSure')} ${n('sure')}` : '',
      n('maybe') ? `${t('expMaybe')} ${n('maybe')}` : '',
      n('court') ? `${t('expCourt')} ${n('court')}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };

  const renderCard = (g: Guest, i: number) => {
    const tb = g.tableId ? tableById.get(g.tableId) : undefined;
    return (
      <li
        key={g.id}
        className={`guest grow${onLocate ? ' pin' : ''}${tb ? ' seated' : ' unseated'}${PLUS.test(g.name) ? ' member' : ''}`}
      >
        <div className="guest-top">
          <input
            type="text"
            className="guest-name"
            maxLength={LIMITS.nameMax}
            value={g.name}
            aria-label={t('guestName')}
            onFocus={() => (nameBefore.current[g.id] = g.name)}
            onChange={(e) => update(g.id, { name: e.target.value }, 'name')}
            onBlur={(e) => {
              // An emptied name does not silently delete the guest: put the name back and ask first.
              if (e.target.value.trim()) return;
              const before = nameBefore.current[g.id];
              if (before) update(g.id, { name: before }, 'name');
              if (onAskRemove) onAskRemove(g.id);
              else if (!before) remove(g.id);
            }}
          />
          {!PLUS.test(g.name) && (
            <span className="stepper plus-step" role="group" aria-label={t('plusPeople')}>
              <button
                type="button"
                aria-label={`${t('plusPeople')} −`}
                disabled={(sizeOf.get(g.id) ?? 1) <= 1}
                onClick={() => onChange(setPartySize(guests, g.id, (sizeOf.get(g.id) ?? 1) - 2), `guest:${g.id}:plus`)}
              >
                −
              </button>
              <output dir="ltr">+{(sizeOf.get(g.id) ?? 1) - 1}</output>
              <button
                type="button"
                aria-label={`${t('plusPeople')} +`}
                disabled={guests.length >= LIMITS.maxGuests}
                onClick={() => onChange(setPartySize(guests, g.id, sizeOf.get(g.id) ?? 1), `guest:${g.id}:plus`)}
              >
                +
              </button>
            </span>
          )}
        </div>
        <div className="guest-bottom">
          <GroupInput
            className="g-group"
            maxLength={LIMITS.groupMax}
            value={g.group}
            suggestions={groups}
            placeholder={t('guestGroup')}
            aria-label={t('guestGroup')}
            onValue={(v) => update(g.id, { group: v }, 'group')}
          />
          <Select
            className="g-table"
            value={g.tableId ?? ''}
            aria-label={t('table')}
            onChange={(e) => {
              const id = e.target.value;
              const target = id ? tableById.get(id) : undefined;
              onChange(
                seatParty(
                  tables,
                  guests,
                  g.id,
                  target ? target.id : null,
                  target ? firstFreeSeat(target, guests, g.id) : null,
                  seatGuest,
                ),
              );
            }}
          >
            <option value="">{t('unseated')}</option>
            {tables.map(tableOption)}
          </Select>
          {tb ? (
            <Select
              className="g-chair"
              value={g.seat ?? ''}
              aria-label={t('chair')}
              title={t('chair')}
              onChange={(e) =>
                onChange(seatGuest(guests, g.id, g.tableId, e.target.value === '' ? null : Number(e.target.value)))
              }
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
            </Select>
          ) : (
            <span className="g-chair" />
          )}
        </div>
        <div className="guest-exp">
          {PLUS.test(g.name) ? (
            <span className="role-seg" role="group" aria-label={`${t('expSure')} / ${t('expMaybe')}`}>
              {(['sure', 'maybe', 'court'] as ExpectKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`${k}${(roleMap.get(g.id) ?? 'sure') === k ? ' on' : ''}`}
                  aria-pressed={(roleMap.get(g.id) ?? 'sure') === k}
                  onClick={() => onChange(setRole(guests, g.id, k), `guest:${g.id}:exp`)}
                >
                  {t(k === 'sure' ? 'expSure' : k === 'maybe' ? 'expMaybe' : 'expCourt')}
                </button>
              ))}
            </span>
          ) : (
            <ExpectSteppers
              size={sizeOf.get(g.id) ?? 1}
              value={planned(g, sizeOf.get(g.id) ?? 1)}
              labels={{ sure: t('expSure'), maybe: t('expMaybe'), court: t('expCourt') }}
              onChange={(sure, maybe) => {
                const size = sizeOf.get(g.id) ?? 1;
                const s0 = Math.max(0, Math.min(size, sure));
                update(g.id, { expect: { sure: s0, maybe: Math.max(0, Math.min(size - s0, maybe)) } }, 'exp');
              }}
            />
          )}
        </div>
        <div className="guest-acts">
          {onLocate &&
            (g.tableId ? (
              <IconButton icon="pin" label={t('showOnMap')} onClick={() => onLocate(g)} />
            ) : (
              <span className="acts-gap" />
            ))}
          <IconButton
            icon="access"
            label={t('stepFree')}
            pressed={g.stepFree}
            onClick={() => update(g.id, { stepFree: !g.stepFree }, 'step')}
          />
          <IconButton
            icon="trash"
            label={t('removeGuest')}
            danger
            onClick={() => (onAskRemove ? onAskRemove(g.id) : remove(g.id))}
          />
        </div>
      </li>
    );
  };

  return (
    <div className="page">
      <div className="page-inner guests">
        <section className="card add-bar">
          <button
            type="button"
            className="primary"
            onClick={() => {
              setJustAdded(0);
              setAdding(true);
            }}
            disabled={room <= 0}
          >
            <Icon name="plus" size={18} /> {t('addGuest')}
          </button>
          <button type="button" className="import-btn" onClick={() => setImporting(true)}>
            <Icon name="upload" size={18} /> {t('importGuests')}
          </button>
          {importing && (
            <ImportGuests
              t={t}
              guests={guests}
              tables={tables}
              onImport={(added, made, changes) =>
                onImportAll && made.length
                  ? onImportAll(added, made, changes)
                  : onChange([...applyChanges(guests, changes), ...added])
              }
              onClose={() => setImporting(false)}
            />
          )}
        </section>
        {adding && (
          <>
            <div
              className="picker-backdrop"
              onMouseDown={() => {
                swallowRestOfPress();
                setAdding(false);
              }}
            />
            <div
              className="import-dialog add-dialog"
              role="dialog"
              aria-label={t('addGuestCard')}
              onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
            >
              <h3>{t('addGuestCard')}</h3>
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
                    <input
                      ref={nameRef}
                      autoFocus
                      type="text"
                      maxLength={LIMITS.nameMax}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="off"
                    />
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
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={99}
                      value={extra || ''}
                      placeholder="0"
                      onChange={(e) => setExtra(Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)))}
                    />
                  </label>
                )}
                <label className="field af-group">
                  <span>{t('guestGroup')}</span>
                  <GroupInput
                    maxLength={LIMITS.groupMax}
                    value={group}
                    suggestions={groups}
                    aria-label={t('guestGroup')}
                    onValue={setGroup}
                  />
                </label>
                <label className="field af-table">
                  <span>{t('table')}</span>
                  <Select value={tableId} onChange={(e) => setTableId(e.target.value)}>
                    <option value="">{t('unseated')}</option>
                    {tables.map(tableOption)}
                  </Select>
                </label>
                <label className="check af-step">
                  <input type="checkbox" checked={stepFree} onChange={(e) => setStepFree(e.target.checked)} />
                  <span>{t('stepFree')}</span>
                </label>
                <div className="af-actions">
                  <button
                    type="submit"
                    className="primary"
                    disabled={room <= 0 || (several ? !bulk.trim() : !name.trim())}
                  >
                    <Icon name="plus" size={18} /> {several ? t('addAll') : t('addGuest')}
                  </button>
                  <button type="button" onClick={() => setSeveral(!several)}>
                    {several ? t('addGuest') : t('addSeveral')}
                  </button>
                </div>
              </form>
              {justAdded > 0 && (
                <p className="notice ok" role="status" style={{ margin: 0 }}>
                  ✓ {justAdded}
                </p>
              )}
              <button type="button" onClick={() => setAdding(false)}>
                {t('done')}
              </button>
            </div>
          </>
        )}

        <section className="card">
          <div className="list-head">
            <h2>{t('guestListTitle')}</h2>
            <p className="totals">
              {t('guestsTotal')}: {guests.length} · {t('seated')}: {seatedTotal} · {t('noTable')}:{' '}
              {guests.length - seatedTotal}
            </p>
          </div>
          <div className="filters">
            <label className="search">
              <Icon name="search" size={18} />
              <input
                type="search"
                placeholder={t('searchGuests')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label={t('searchGuests')}
              />
            </label>
            <button
              type="button"
              className={`btn filter-btn${activeFilters ? ' on' : ''}`}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
            >
              <Icon name="filter" size={18} />
              {t('filters')}
              {activeFilters > 0 && <span className="filter-n">{activeFilters}</span>}
            </button>
          </div>
          {filtersOpen && (
            <div className="filter-panel">
              <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label={t('filterAll')}>
                <option value="all">{t('filterAll')}</option>
                <option value="unseated">{t('filterUnseated')}</option>
                <option value="seated">{t('filterSeated')}</option>
              </Select>
              <Select
                value={expFilter}
                onChange={(e) => setExpFilter(e.target.value as 'all' | ExpectKind)}
                aria-label={t('filterExpAll')}
              >
                <option value="all">{t('filterExpAll')}</option>
                <option value="sure">
                  {t('expSure')} ({roleCount.sure})
                </option>
                <option value="maybe">
                  {t('expMaybe')} ({roleCount.maybe})
                </option>
                <option value="court">
                  {t('expCourt')} ({roleCount.court})
                </option>
              </Select>
              <Select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} aria-label={t('tableAll')}>
                <option value="">{t('tableAll')}</option>
                {tables.map(tableOption)}
              </Select>
              <Select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} aria-label={t('groupAll')}>
                <option value="">{t('groupAll')}</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
              {activeFilters > 0 && (
                <button type="button" className="btn" onClick={clearFilters}>
                  {t('clearFilters')}
                </button>
              )}
            </div>
          )}

          {guests.length === 0 && <p className="muted">{t('noGuests')}</p>}
          {guests.length > 0 && visible.length === 0 && <p className="muted">{t('noMatches')}</p>}

          <ul className="guest-list glist">
            {rows.map(({ head, kids }) => (
              <Fragment key={head.g.id}>
                {renderCard(head.g, head.i)}
                {kids.length > 0 && (
                  <li className="kids-wrap">
                    <details className="kids" open={expFilter !== 'all'} key={expFilter}>
                      <summary>
                        <span dir="ltr">+{kids.length}</span>
                        <span className="kids-sum">{kidsSummary(kids.map((k) => roleMap.get(k.g.id) ?? 'sure'))}</span>
                      </summary>
                      <ul className="kids-list">{kids.map((k) => renderCard(k.g, k.i))}</ul>
                    </details>
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
          {guests.length > 0 && (
            <details
              className="danger-zone"
              onToggle={(e) => {
                if (!(e.target as HTMLDetailsElement).open) {
                  setAskDeleteAll(false);
                  setTyped('');
                }
              }}
            >
              <summary>{t('dangerZone')}</summary>
              {!askDeleteAll ? (
                <button type="button" onClick={() => setAskDeleteAll(true)}>
                  <Icon name="trash" size={18} /> {t('deleteAllGuests')}
                </button>
              ) : (
                <div className="column-gap">
                  <span className="error">
                    {t('confirmDeleteAll')} ({guests.length})
                  </span>
                  <label className="field">
                    <span>
                      {t('typeToConfirm')} «{t('deleteWord')}»
                    </span>
                    <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
                  </label>
                  <div className="row">
                    <button
                      type="button"
                      className="primary danger-fill"
                      disabled={typed.trim().toLowerCase() !== t('deleteWord').toLowerCase()}
                      onClick={() => {
                        onChange([]);
                        setAskDeleteAll(false);
                        setTyped('');
                      }}
                    >
                      {t('deleteAllGuests')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAskDeleteAll(false);
                        setTyped('');
                      }}
                    >
                      {t('importCancel')}
                    </button>
                  </div>
                </div>
              )}
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
