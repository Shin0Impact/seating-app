import { IconButton } from '../Icon';
import type { Key } from '@/lib/i18n';

type T = (k: Key) => string;
export type Marquee = { x0: number; y0: number; x1: number; y1: number };

/** Bar shown while people are picked on chairs: unseat them or clear the pick. */
export function PickBar({
  t,
  count,
  onUnseat,
  onClear,
}: {
  t: T;
  count: number;
  onUnseat: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="pickbar" role="status">
      <b>{count}</b> {t('peopleSelected')}
      <button onClick={onUnseat}>{t('unseatSelected')}</button>
      <button onClick={onClear}>{t('clearSelection')}</button>
    </div>
  );
}

export function ScaleBar({ t, scale }: { t: T; scale: number }) {
  return (
    <>
      <div className="scalebar" dir="ltr" aria-hidden>
        <div style={{ width: scale }} />
        <span>1 m</span>
      </div>
      <div className="hint">{t('hint')}</div>
    </>
  );
}

export function MarqueeBox({ box }: { box: Marquee | null }) {
  if (!box) return null;
  return (
    <div
      className="marquee"
      style={{
        left: Math.min(box.x0, box.x1),
        top: Math.min(box.y0, box.y1),
        width: Math.abs(box.x1 - box.x0),
        height: Math.abs(box.y1 - box.y0),
      }}
    />
  );
}

type ToolsProps = {
  t: T;
  snapGrid: boolean;
  locked: boolean;
  selectTool: boolean;
  peopleTool: boolean;
  onFit: () => void;
  onSnap: () => void;
  onLock: () => void;
  onSelectTool: () => void;
  onPeopleTool: () => void;
};

/** The small button column in the corner of the canvas. */
export function CanvasTools(p: ToolsProps) {
  const { t } = p;
  return (
    <div className="fit">
      <IconButton icon="fit" label={t('fit')} onClick={p.onFit} />
      <IconButton icon="grid" label={t('snapGrid')} pressed={p.snapGrid} onClick={p.onSnap} />
      <IconButton icon="lock" label={t('lockLayout')} pressed={p.locked} onClick={p.onLock} />
      <IconButton icon="select" label={t('selectTool')} pressed={p.selectTool} onClick={p.onSelectTool} />
      <IconButton icon="users" label={t('peopleTool')} pressed={p.peopleTool} onClick={p.onPeopleTool} />
    </div>
  );
}
