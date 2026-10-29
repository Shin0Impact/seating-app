import { Element, LIMITS, snap } from '@/lib/layout';
import { round2 } from '../NumField';

const clampSize = (v: number) => Math.min(LIMITS.sizeMax, Math.max(LIMITS.sizeMin, round2(v)));

export type Transformed = { sx: number; sy: number; x: number; y: number; rotation: number };

/**
 * Turns a finished resize/rotate on the canvas into the fields to change on the element.
 * Tables grow by chair count, columns by size, everything else by width and height
 * (with the dragged edges snapped to the grid when `snapToGrid` is on and the shape is square to the axes).
 */
export function resizePatch(el: Element, t: Transformed, snapToGrid: boolean): Partial<Element> {
  const { sx, sy, rotation: r } = t;
  const pos = { x: round2(t.x), y: round2(t.y), rotation: r };
  if (el.kind === 'table') {
    const seats = Math.min(LIMITS.seatsMax, Math.max(LIMITS.seatsMin, Math.round(el.seats * sx)));
    return { ...pos, seats } as Partial<Element>;
  }
  if (el.kind === 'column') return { ...pos, size: clampSize(el.size * sx) } as Partial<Element>;

  let w = clampSize(el.w * sx);
  let h = clampSize(el.h * sy);
  let { x, y } = t;
  if (snapToGrid && r % 90 === 0) {
    const swap = Math.abs(r) % 180 === 90;
    const bw = swap ? h : w;
    const bh = swap ? w : h;
    const left = snap(t.x - bw / 2, 1);
    const right = Math.max(left + 1, snap(t.x + bw / 2, 1));
    const top = snap(t.y - bh / 2, 1);
    const bottom = Math.max(top + 1, snap(t.y + bh / 2, 1));
    x = (left + right) / 2;
    y = (top + bottom) / 2;
    if (swap) {
      h = right - left;
      w = bottom - top;
    } else {
      w = right - left;
      h = bottom - top;
    }
  }
  return { w: clampSize(w), h: clampSize(h), x: round2(x), y: round2(y), rotation: r } as Partial<Element>;
}
