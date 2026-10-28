import { describe, expect, it } from 'vitest';
import { fitChairLabel, splitPlus } from './chairlabel';

const m = (t: string, px: number) => Array.from(t).length * px * 0.6; // 0.6 px per char per px of font

describe('splitPlus', () => {
  it('separates the +N', () => {
    expect(splitPlus('ضيف تجريبي +2')).toEqual({ base: 'ضيف تجريبي', plus: '+2' });
    expect(splitPlus('Sami')).toEqual({ base: 'Sami', plus: null });
    expect(splitPlus('A+1')).toEqual({ base: 'A+1', plus: null });
  });
});

describe('fitChairLabel', () => {
  it('keeps a short name as is', () => {
    expect(fitChairLabel('Sami', 100, 40, 14, m)).toMatchObject({ main: 'Sami', plus: null, scale: 1 });
  });
  it('shows first name and a +N line when there is height for two lines', () => {
    const r = fitChairLabel('Test Guest +1', 40, 40, 14, m);
    expect(r.twoLines).toBe(true);
    expect(r.plus).toBe('+1');
    expect(m(r.main, 14 * r.scale)).toBeLessThanOrEqual(40);
  });
  it('keeps +N on one line when the chair is short, and shortens only the name', () => {
    const r = fitChairLabel('Guest +3', 50, 14, 14, m);
    expect(r.twoLines).toBe(false);
    expect(r.plus).toBe('+3');
    expect(m(r.main + ' +3', 14 * r.scale)).toBeLessThanOrEqual(50.5);
    expect(r.main.length).toBeGreaterThan(0);
  });
  it('never returns something wider than the chair', () => {
    const r = fitChairLabel('Abdelrahman Ibrahim +1', 30, 40, 14, m);
    expect(m(r.main, 14 * r.scale)).toBeLessThanOrEqual(30);
  });
});
