import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { LIMITS, MARKER_KINDS, MarkerKind } from '@/lib/layout';
import { Key, Lang, dirOf } from '@/lib/i18n';
import { coarsePointer } from '@/lib/touchdrag';
import { NumField } from '../NumField';
import { specToString, type Spec } from '../editor-specs';

type Props = {
  t: (k: Key) => string;
  lang: Lang;
  pos: { x: number; y: number };
  seats: number;
  onSeats: (n: number) => void;
  markerLabel: (k: MarkerKind) => string;
  /** The button that opened this; pressing it should not count as a click outside. */
  anchorRef: RefObject<HTMLElement | null>;
  onAdd: (spec: Spec) => void;
  onClose: () => void;
};

/** The "add new" panel: every kind of element, to click (first free spot) or drag onto the hall. */
export function AddPopover({ t, lang, pos, seats, onSeats, markerLabel, anchorRef, onAdd, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragHide, setDragHide] = useState(false);

  useEffect(() => {
    const down = (e: Event) => {
      const n = e.target as Node;
      if (ref.current?.contains(n) || anchorRef.current?.contains(n)) return;
      onClose();
    };
    const gone = () => {
      setDragHide(false);
      onClose();
    };
    const tdrag = (e: Event) => {
      if ((e as CustomEvent).detail === 'start') setDragHide(true);
      else gone();
    };
    document.addEventListener('pointerdown', down, true);
    window.addEventListener('dragend', gone);
    window.addEventListener('drop', gone);
    window.addEventListener('seat-touchdrag', tdrag);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      window.removeEventListener('dragend', gone);
      window.removeEventListener('drop', gone);
      window.removeEventListener('seat-touchdrag', tdrag);
    };
  }, []);

  const palette: { key: string; label: string; glyph: string; spec: () => Spec }[] = [
    { key: 'tr', label: t('roundTable'), glyph: 'round', spec: () => ({ kind: 'table', shape: 'round', seats }) },
    { key: 'tc', label: t('rectTable'), glyph: 'rect', spec: () => ({ kind: 'table', shape: 'rect', seats }) },
    { key: 'cc', label: t('roundColumn'), glyph: 'col-round', spec: () => ({ kind: 'column', shape: 'circle' }) },
    { key: 'cs', label: t('squareColumn'), glyph: 'col-square', spec: () => ({ kind: 'column', shape: 'square' }) },
    { key: 'zn', label: t('raisedArea'), glyph: 'zone', spec: () => ({ kind: 'zone' }) },
    ...MARKER_KINDS.map((k) => ({
      key: `m-${k}`,
      label: markerLabel(k),
      glyph: `mk mk-${k}`,
      spec: (): Spec => ({ kind: 'marker', marker: k }),
    })),
  ];

  return (
    <div
      ref={ref}
      className={`addpop${dragHide ? ' drag-hide' : ''}`}
      role="dialog"
      aria-label={t('addNew')}
      style={{ top: pos.y, [dirOf(lang) === 'rtl' ? 'right' : 'left']: pos.x }}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <NumField
        label={t('chairs')}
        value={seats}
        min={LIMITS.seatsMin}
        max={LIMITS.seatsMax}
        step={1}
        int
        onChange={onSeats}
      />
      <p className="muted">{t('paletteHint')}</p>
      <div className="palette">
        {palette.map((p) => (
          <button
            key={p.key}
            className="tile"
            draggable={!coarsePointer()}
            data-tdrag={`preset:${specToString(p.spec())}`}
            title={`${p.label} — ${t('paletteHint')}`}
            onDragStart={(e) => {
              e.dataTransfer.setData('text/element-preset', specToString(p.spec()));
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => {
              onAdd(p.spec());
              onClose();
            }}
          >
            <span className={`pg ${p.glyph}`} aria-hidden />
            <span className="tile-label">{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
