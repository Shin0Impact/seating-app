import { describe, expect, it } from 'vitest';
import { newColumn, newMarker, newTable } from '@/lib/layout';
import { resizePatch } from './resizeElement';

const at = { x: 3.333, y: 4.449, rotation: 0 };

describe('resizePatch', () => {
  it('turns a table resize into a chair count and rounds the position', () => {
    const t = newTable(0, 0, 'round', 10, 1);
    expect(resizePatch(t, { ...at, sx: 1.5, sy: 1.5 }, false)).toMatchObject({ seats: 15, x: 3.33, y: 4.45 });
  });

  it('keeps table chairs within limits', () => {
    const t = newTable(0, 0, 'round', 10, 1);
    expect((resizePatch(t, { ...at, sx: 0.01, sy: 0.01 }, false) as { seats: number }).seats).toBeGreaterThanOrEqual(1);
  });

  it('scales a column by size', () => {
    const c = newColumn(0, 0, 'circle');
    const patch = resizePatch(c, { ...at, sx: 2, sy: 2 }, false) as { size: number };
    expect(patch.size).toBeCloseTo(c.size * 2, 1);
  });

  it('scales markers by width and height, and snaps edges to the grid on request', () => {
    const m = newMarker(0, 0, 'stage');
    const free = resizePatch(m, { x: 0.3, y: 0.3, rotation: 0, sx: 1.37, sy: 1.21 }, false) as { w: number; h: number };
    expect(free.w).toBeCloseTo(m.w * 1.37, 1);
    const snapped = resizePatch(m, { x: 0.3, y: 0.3, rotation: 0, sx: 1.37, sy: 1.21 }, true) as {
      w: number;
      h: number;
    };
    expect(Number.isInteger(snapped.w)).toBe(true);
    expect(Number.isInteger(snapped.h)).toBe(true);
  });
});
