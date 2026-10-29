'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { Layout } from '@/lib/layout';
import type { Focus } from '@/lib/route';
import { drawHall, hallBounds, readPalette, type Palette } from '@/lib/hallDraw';

export type MapView = { k: number; x: number; y: number };
export type HallCanvasApi = { draw: (v: MapView) => void };

/** The hall on a canvas: pan and zoom just redraw it sharply, so no browser re-rasterizing of thousands of shapes. */
const HallCanvas = forwardRef<HallCanvasApi, { layout: Layout; focus?: Focus | null; label: string }>(
  function HallCanvas({ layout, focus, label }, ref) {
    const cv = useRef<HTMLCanvasElement>(null);
    const view = useRef<MapView>({ k: 1, x: 0, y: 0 });
    const pal = useRef<Palette | null>(null);

    const paint = useCallback(() => {
      const c = cv.current;
      if (!c) return;
      const t0 = performance.now();
      const w = c.clientWidth,
        h = c.clientHeight;
      if (!w || !h) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      const ctx = c.getContext('2d');
      if (!ctx) return;
      pal.current ??= readPalette(c);
      const b = hallBounds(layout, focus);
      const fit = Math.min(w / b.w, h / b.h); // "meet": the whole hall fits at zoom 1
      const v = view.current;
      const s = fit * v.k * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.setTransform(
        s,
        0,
        0,
        s,
        (v.x + v.k * ((w - b.w * fit) / 2 - b.x0 * fit)) * dpr,
        (v.y + v.k * ((h - b.h * fit) / 2 - b.y0 * fit)) * dpr,
      );
      drawHall(ctx, layout, focus, pal.current);
      const dt = performance.now() - t0;
      const st = ((window as unknown as { __hall?: { last: number; max: number } }).__hall ??= { last: 0, max: 0 });
      st.last = dt;
      st.max = Math.max(st.max * 0.98, dt);
    }, [layout, focus]);

    useImperativeHandle(ref, () => ({
      draw: (v) => {
        view.current = v;
        paint();
      },
    }));

    useEffect(() => {
      paint();
      const c = cv.current;
      if (!c) return;
      const ro = new ResizeObserver(paint);
      ro.observe(c);
      return () => ro.disconnect();
    }, [paint]);

    return <canvas ref={cv} className="hall-canvas" role="img" aria-label={label} />;
  },
);
export default HallCanvas;
