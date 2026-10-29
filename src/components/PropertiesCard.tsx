import { LIMITS, tableDims, tableFootprint, type Element, type Guest, type Settings } from '@/lib/layout';
import type { Key } from '@/lib/i18n';
import { IconButton } from './Icon';
import { NumField, round2 } from './NumField';

type Props = {
  t: (k: Key) => string;
  selection: string[];
  selected: Element | null;
  settings: Settings;
  guestsAtSelected: Guest[];
  onPatch: (id: string, patch: Partial<Element>, key?: string) => void;
  onShape: (ids: string[], shape: 'round' | 'rect') => void;
  onSeats: (id: string, seats: number) => void;
  onHalf: (id: string, half: boolean) => void;
  onDuplicate: () => void;
  onRotate: () => void;
  onRemove: () => void;
};

/** The "Properties" card: name, size, chairs, rotation and position of whatever is selected. */
export function PropertiesCard({ t, selection, selected, settings, guestsAtSelected, onPatch, onShape, onSeats, onHalf, onDuplicate, onRotate, onRemove }: Props) {
  const dims = selected && selected.kind === 'table' ? tableDims(selected, settings) : null;
  const footprint = selected && selected.kind === 'table' ? tableFootprint(selected, settings) : null;
  return (
      <section className="card" data-props>
        <h2>{t('properties')}</h2>
        {selection.length === 0 && <p className="muted">{t('nothingSelected')}</p>}
        {selection.length > 1 && (
          <>
            <p className="totals">{selection.length} {t('selectedItems')}</p>
            <div className="multi-actions">
              <IconButton icon="copy" label={t('duplicate')} onClick={onDuplicate} />
              <button onClick={onRotate}>{t('rotate90')}</button>
              <IconButton icon="trash" label={t('remove')} danger onClick={onRemove} />
            </div>
          </>
        )}
        {selected && (
          <>
            <label className="field">
              <span>{t('name')}</span>
              <input type="text" maxLength={LIMITS.labelMax} value={selected.label} onChange={(e) => onPatch(selected.id, { label: e.target.value }, 'label')} />
            </label>
            {selected.kind === 'table' && (
              <>
                <div className="field">
                  <span>{t('shape')}</span>
                  <div className="seg" role="group" aria-label={t('shape')}>
                    {(['round', 'rect'] as const).map((sh) => (
                      <button key={sh} className={selected.shape === sh ? 'on' : ''} aria-pressed={selected.shape === sh} onClick={() => onShape([selected.id], sh)}>
                        <span className={`glyph ${sh}`} aria-hidden /> {t(sh === 'round' ? 'shapeRound' : 'shapeRect')}
                      </button>
                    ))}
                  </div>
                </div>
                {selected.shape === 'rect' && (
                  <label className="field check">
                    <input type="checkbox" checked={!!selected.half} onChange={(e) => onHalf(selected.id, e.target.checked)} />
                    <span>{t('halfTable')}</span>
                  </label>
                )}
                <NumField label={t('chairs')} value={selected.seats} min={LIMITS.seatsMin} max={LIMITS.seatsMax} step={1} int onChange={(v) => onSeats(selected.id, v)} />
                {dims?.shape === 'round' && <p className="muted">{t('diameter')}: {round2(dims.diameter)} m</p>}
                {dims?.shape === 'rect' && <p className="muted">{t('length')}: {round2(dims.length)} m × {round2(dims.width)} m</p>}
                {footprint && (
                  <p className="muted">
                    {t('withChairs')}: {footprint.type === 'circle' ? `${round2(footprint.r * 2)} m` : `${round2(footprint.w)} × ${round2(footprint.h)} m`}
                  </p>
                )}
                {guestsAtSelected.length > 0 && (
                  <div className="at-table">
                    <p className="muted">{t('guestsAtTable')} ({guestsAtSelected.length}/{selected.seats})</p>
                    <ul>
                      {guestsAtSelected.map((g) => (
                        <li key={g.id}>{g.seat !== null ? `${g.seat + 1}. ` : ''}{g.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
            {selected.kind === 'column' && (
              <NumField label={t('size')} value={selected.size} min={LIMITS.sizeMin} max={LIMITS.sizeMax} onChange={(v) => onPatch(selected.id, { size: v }, 'size')} />
            )}
            {(selected.kind === 'zone' || selected.kind === 'marker') && (
              <div className="two">
                <NumField label={t('width')} value={selected.w} min={LIMITS.sizeMin} max={LIMITS.sizeMax} onChange={(v) => onPatch(selected.id, { w: v }, 'w')} />
                <NumField label={t('depth')} value={selected.h} min={LIMITS.sizeMin} max={LIMITS.sizeMax} onChange={(v) => onPatch(selected.id, { h: v }, 'h')} />
              </div>
            )}
            {selected.kind === 'zone' && (
              <NumField label={t('steps')} value={selected.steps} min={0} max={50} step={1} int onChange={(v) => onPatch(selected.id, { steps: v }, 'steps')} />
            )}
            <NumField label={t('rotation')} value={selected.rotation} min={-360} max={360} step={5} onChange={(v) => onPatch(selected.id, { rotation: v }, 'rot')} />
            <div className="two">
              <NumField label={t('posX')} value={selected.x} min={-LIMITS.coordMax} max={LIMITS.coordMax} onChange={(v) => onPatch(selected.id, { x: v }, 'x')} />
              <NumField label={t('posY')} value={selected.y} min={-LIMITS.coordMax} max={LIMITS.coordMax} onChange={(v) => onPatch(selected.id, { y: v }, 'y')} />
            </div>
            <div className="row">
              <IconButton icon="copy" label={t('duplicate')} onClick={onDuplicate} />
              <button onClick={onRotate}>{t('rotate90')}</button>
              <IconButton icon="trash" label={t('remove')} danger onClick={onRemove} />
            </div>
          </>
        )}
      </section>
  );
}
