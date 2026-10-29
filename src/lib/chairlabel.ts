/** Fits a guest's name onto a chair. "Name +1" keeps its "+1" (shown as a small second line, or kept at the end of one line). */
export type ChairLabel = { main: string; plus: string | null; scale: number; twoLines: boolean };

const PLUS = /^(.*\S)\s*\+(\d{1,2})$/;
export const splitPlus = (name: string): { base: string; plus: string | null } => {
  const m = PLUS.exec(name.trim());
  return m ? { base: m[1], plus: `+${m[2]}` } : { base: name.trim(), plus: null };
};

export type Measure = (text: string, px: number) => number;

let ctx: CanvasRenderingContext2D | null | undefined;
/** Real text width in pixels (Arabic shapes are wider than a character count suggests). */
export const canvasMeasure =
  (font: string): Measure =>
  (text, px) => {
    if (ctx === undefined)
      ctx = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (!ctx) return Array.from(text).length * px * 0.62;
    ctx.font = `bold ${px}px ${font}`;
    return ctx.measureText(text).width;
  };

const SHRINK = [1, 0.86, 0.74];

export function fitChairLabel(
  name: string,
  availW: number,
  availH: number,
  fontPx: number,
  measure: Measure,
): ChairLabel {
  const { base, plus } = splitPlus(name);
  const first = base.split(/\s+/)[0] ?? base;
  const twoLines = !!plus && availH >= fontPx * 1.9;
  const room = (k: number) => availW - (plus && !twoLines ? measure(` ${plus}`, fontPx * k) : 0);
  const done = (main: string, k: number): ChairLabel => ({ main, plus, scale: k, twoLines });
  for (const cand of first === base ? [base] : [base, first]) {
    for (const k of SHRINK) if (measure(cand, fontPx * k) <= room(k)) return done(cand, k);
  }
  // Still too wide: shorten the first name, never the +N.
  const k = SHRINK[SHRINK.length - 1];
  const chars = Array.from(first);
  for (let n = chars.length - 1; n >= 1; n--) {
    const t = chars.slice(0, n).join('') + '…';
    if (measure(t, fontPx * k) <= room(k)) return done(t, k);
  }
  return done(chars[0] ?? '?', k);
}
