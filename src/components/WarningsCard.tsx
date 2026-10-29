import type { Issue, TableEl } from '@/lib/layout';
import type { Key } from '@/lib/i18n';

type Props = {
  t: (k: Key) => string;
  totals: { tables: number; seats: number };
  issues: Issue[];
  full: TableEl[];
  seated: Map<string, number>;
  nameById: (id: string) => string;
  onSelect: (id: string) => void;
};

/** Overlap, tight-walkway and overfull-table warnings. */
export function WarningsCard({ t, totals, issues, full, seated, nameById, onSelect }: Props) {
  return (
      <section className="card">
        <h2>{t('warnings')}</h2>
        <p className="totals">
          {t('tables')}: {totals.tables} · {t('seatsTotal')}: {totals.seats}
        </p>
        {issues.length === 0 && full.length === 0 && <p className="muted">{t('noWarnings')}</p>}
        <ul className="issues">
          {issues.map((i, idx) => (
            <li key={idx} className={i.type}>
              <button onClick={() => onSelect(i.a)}>
                <b>{t(i.type)}</b> {nameById(i.a)} / {nameById(i.b)}
              </button>
            </li>
          ))}
          {full.map((tb) => (
            <li key={`full-${tb.id}`} className="overlap">
              <button onClick={() => onSelect(tb.id)}>
                <b>{t('overfull')}</b> {tb.label} ({seated.get(tb.id) ?? 0}/{tb.seats})
              </button>
            </li>
          ))}
        </ul>
      </section>
  );
}
