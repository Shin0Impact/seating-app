import type { RefObject } from 'react';
import { Icon } from './Icon';
import type { Element } from '@/lib/layout';
import type { Key } from '@/lib/i18n';
import { coarsePointer } from '@/lib/touchdrag';
import { clamp, specToString, type Spec } from './editor-specs';

type Props = {
  t: (k: Key) => string;
  presets: { shape: 'round' | 'rect'; seats: number }[];
  addOpen: boolean;
  addBtnRef: RefObject<HTMLButtonElement | null>;
  onToggleAdd: () => void;
  onAddPreset: (spec: Spec) => void;
  copies: number;
  onCopies: (n: number) => void;
  onCopyTable: () => void;
  selected: Element | null;
};

/** The bar under the title: "Add", the quick table sizes, and Copy table. */
export function QuickTablesBar({
  t,
  presets,
  addOpen,
  addBtnRef,
  onToggleAdd,
  onAddPreset,
  copies,
  onCopies,
  onCopyTable,
  selected,
}: Props) {
  return (
    <div className="tablebar" role="toolbar" aria-label={t('quickTables')}>
      <button
        ref={addBtnRef}
        className={`add-new primary${addOpen ? ' on' : ''}`}
        aria-expanded={addOpen}
        onClick={onToggleAdd}
      >
        <Icon name="plus" size={18} /> {t('addNew')}
      </button>
      <span className="sep" aria-hidden />
      <span className="tb-label">{t('quickTables')}</span>
      <span className="chip-group">
        {presets.map(({ shape, seats: n }) => (
          <button
            key={`${shape}${n}`}
            className="chip"
            draggable={!coarsePointer()}
            data-tdrag={`preset:${specToString({ kind: 'table', shape, seats: n })}`}
            title={`${t(shape === 'round' ? 'roundTable' : 'rectTable')} · ${n} — ${t('dragPreset')}`}
            aria-label={`${t(shape === 'round' ? 'roundTable' : 'rectTable')} ${n}`}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/element-preset', specToString({ kind: 'table', shape, seats: n }));
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => onAddPreset({ kind: 'table', shape, seats: n })}
          >
            <span className={`glyph ${shape}`} aria-hidden />
            {n}
          </button>
        ))}
      </span>
      <span className="sep" aria-hidden />
      <label className="copies" title={t('copyHint')}>
        <span>{t('copies')}</span>
        <input
          type="number"
          min={1}
          max={20}
          value={copies}
          onChange={(e) => onCopies(clamp(Math.round(Number(e.target.value) || 1), 1, 20))}
        />
      </label>
      <button
        className="copy-table"
        onClick={onCopyTable}
        disabled={!selected || selected.kind !== 'table'}
        title={t('copyHint')}
      >
        <Icon name="copy" size={18} /> {t('copyTable')}
        {selected && selected.kind === 'table' ? ` (${selected.seats})` : ''}
      </button>
    </div>
  );
}
