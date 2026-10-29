import { chairSlots, tableDims, toWorld, type Layout } from './layout';
import { softPath, type Focus } from './route';

export type Bounds = { x0: number; y0: number; w: number; h: number };

/** The area the hall plus the route occupy, with a one-meter margin. */
export function hallBounds(layout: Layout, focus?: Focus | null): Bounds {
  const { elements, settings } = layout;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  const grow = (x: number, y: number, r: number) => {
    x0 = Math.min(x0, x - r);
    y0 = Math.min(y0, y - r);
    x1 = Math.max(x1, x + r);
    y1 = Math.max(y1, y + r);
  };
  for (const e of elements) {
    if (e.kind === 'table') {
      const d = tableDims(e, settings);
      grow(
        e.x,
        e.y,
        (d.shape === 'round' ? d.diameter / 2 : Math.max(d.length, d.width) / 2) + settings.chairDepth + 0.3,
      );
    } else if (e.kind === 'column') grow(e.x, e.y, e.size / 2);
    else grow(e.x, e.y, Math.max(e.w, e.h) / 2 + 0.2);
  }
  for (const p of focus?.route ?? []) grow(p.x, p.y, 0.6);
  const pad = 1;
  return { x0: x0 - pad, y0: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

export type Palette = {
  surface: string;
  line: string;
  chip: string;
  accent: string;
  ink: string;
  panel: string;
  font: string;
};

/** Reads the theme colours once; the canvas cannot use CSS variables directly. */
export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    surface: v('--surface', '#fff'),
    line: v('--line-strong', '#cfc8b8'),
    chip: v('--chip', '#efe9da'),
    accent: v('--accent', '#2f5fc4'),
    ink: v('--ink', '#2b2a28'),
    panel: v('--panel', '#fffdf8'),
    font: getComputedStyle(document.body).fontFamily || 'sans-serif',
  };
}

const ROUTE = '#e0a53a';

/**
 * Draws the whole hall in one pass. `ctx` must already map one unit to one meter (see HallCanvas);
 * everything is plain fills and strokes, so a redraw costs a few milliseconds at any zoom.
 */
export function drawHall(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  focus: Focus | null | undefined,
  p: Palette,
  /** Device pixels per meter, used to skip detail too small to see. */
  scale = 40,
  /** 'base' is the still hall; 'overlay' is the animated route, rings and seat dot, drawn alone on their own canvas. */
  part: 'base' | 'overlay' = 'base',
  /** Seconds, drives the moving dashes and the pulse. */
  time = 0,
) {
  const { elements, guests, settings } = layout;
  const marked = new Set(focus?.tableIds ?? []);
  const seated = new Map<string, Set<number>>();
  for (const g of guests)
    if (g.tableId && g.seat != null)
      (seated.get(g.tableId) ?? seated.set(g.tableId, new Set()).get(g.tableId)!).add(g.seat);

  const stroke = (fill: string | null, line: string | null, width: number) => {
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (line) {
      ctx.strokeStyle = line;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  };
  const circle = (x: number, y: number, r: number) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  };
  const rrect = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };
  const label = (text: string, x: number, y: number) => {
    // drawn large and scaled down: tiny font sizes are rounded badly by some browsers
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(0.01, 0.01);
    ctx.font = `45px ${p.font}`;
    ctx.fillStyle = p.ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  const placed = (x: number, y: number, rot: number, draw: () => void) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    draw();
    ctx.restore();
  };

  if (part === 'base') {
    // chairs are most of the shapes: batch them into a few paths (by dimmed / taken) instead of one draw each
    const chairR = settings.seatWidth * 0.36;
    const showChairEdge = chairR * scale >= 2.5;
    const batches = [0, 1, 2, 3].map(() => new Path2D());
    for (const e of elements) {
      if (e.kind !== 'table') continue;
      const taken = seated.get(e.id);
      const dim = focus && !marked.has(e.id) ? 2 : 0;
      chairSlots(e, settings).forEach((c, i) => {
        const w = toWorld(e, c.x, c.y);
        const b = batches[dim + (taken?.has(i) ? 1 : 0)];
        b.moveTo(w.x + chairR, w.y);
        b.arc(w.x, w.y, chairR, 0, Math.PI * 2);
      });
    }
    batches.forEach((path, i) => {
      ctx.globalAlpha = i >= 2 ? 0.45 : 1;
      const on = i % 2 === 1;
      ctx.fillStyle = on ? p.accent : p.chip;
      ctx.fill(path);
      if (showChairEdge || on) {
        ctx.strokeStyle = on ? p.accent : p.line;
        ctx.lineWidth = 0.04;
        ctx.stroke(path);
      }
    });
    ctx.globalAlpha = 1;

    for (const e of elements) {
      if (e.kind === 'table') {
        const d = tableDims(e, settings);
        ctx.globalAlpha = focus && !marked.has(e.id) ? 0.45 : 1;
        if (d.shape === 'round') {
          circle(e.x, e.y, d.diameter / 2);
          stroke(p.surface, p.line, 0.06);
        } else
          placed(e.x, e.y, e.rotation, () => {
            rrect(-d.length / 2, -d.width / 2, d.length, d.width, 0.1);
            stroke(p.surface, p.line, 0.06);
          });
        if (0.45 * scale >= 6) label(e.label, e.x, e.y);
        ctx.globalAlpha = 1;
      } else if (e.kind === 'column') {
        if (e.shape === 'circle') {
          circle(e.x, e.y, e.size / 2);
          stroke(p.line, null, 0);
        } else
          placed(e.x, e.y, e.rotation, () => {
            ctx.beginPath();
            ctx.rect(-e.size / 2, -e.size / 2, e.size, e.size);
            stroke(p.line, null, 0);
          });
      } else if (e.kind === 'marker' && e.marker !== 'walkway') {
        placed(e.x, e.y, e.rotation, () => {
          rrect(-e.w / 2, -e.h / 2, e.w, e.h, 0.15);
          if (e.marker === 'exit') stroke('#bfe8c9', '#1f8a4c', 0.08);
          else stroke(p.chip, p.line, 0.05);
          if (e.label && 0.45 * scale >= 6) label(e.label, 0, 0);
        });
      } else if (e.kind === 'zone' && e.steps > 0) {
        // a small staircase symbol centred on the stair line
        const k = Math.min(1.1, Math.max(0.6, Math.min(e.w, e.h) * 0.35)) / 1.1;
        placed(e.x, e.y, e.rotation, () => {
          ctx.translate(0, e.h / 2 + (0.28 * e.steps) / 2);
          ctx.rotate((-e.rotation * Math.PI) / 180);
          ctx.scale(k, k);
          circle(0, 0, 0.78);
          stroke('#f3e3b3', '#9a7a2e', 0.07);
          ctx.beginPath();
          ctx.moveTo(-0.5, 0.4);
          ctx.lineTo(-0.17, 0.4);
          ctx.lineTo(-0.17, 0.1);
          ctx.lineTo(0.17, 0.1);
          ctx.lineTo(0.17, -0.2);
          ctx.lineTo(0.5, -0.2);
          ctx.lineTo(0.5, -0.5);
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          stroke(null, '#5f4608', 0.12);
          ctx.lineJoin = 'miter';
          ctx.lineCap = 'butt';
        });
      }
    }
  }
  if (!focus || part === 'base') return;

  const pulse = 0.775 + 0.225 * Math.cos((time * Math.PI * 2) / 1.6); // 1 -> 0.55 -> 1 every 1.6 s
  ctx.globalAlpha = pulse;
  ctx.setLineDash([0.5, 0.3]);
  for (const e of elements) {
    if (e.kind !== 'table' || !marked.has(e.id)) continue;
    const d = tableDims(e, settings);
    if (d.shape === 'round') circle(e.x, e.y, d.diameter / 2 + settings.chairDepth + 0.45);
    else
      placed(e.x, e.y, e.rotation, () =>
        rrect(
          -d.length / 2 - 0.45,
          -d.width / 2 - settings.chairDepth - 0.45,
          d.length + 0.9,
          d.width + settings.chairDepth * 2 + 0.9,
          0.5,
        ),
      );
    stroke(null, p.accent, 0.14);
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  if (focus.route) {
    ctx.setLineDash([0.7, 0.5]);
    ctx.lineDashOffset = -(time % 1.2); // dashes flow toward the seat, one meter per second
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ROUTE;
    ctx.lineWidth = 0.24;
    ctx.stroke(new Path2D(softPath(focus.route)));
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
  }
  if (focus.start) {
    circle(focus.start.x, focus.start.y, 0.4);
    stroke(p.accent, p.panel, 0.1);
  }
  if (focus.chair) {
    ctx.globalAlpha = pulse;
    circle(focus.chair.x, focus.chair.y, 0.5);
    stroke(ROUTE, p.panel, 0.12);
    ctx.globalAlpha = 1;
  }
}
