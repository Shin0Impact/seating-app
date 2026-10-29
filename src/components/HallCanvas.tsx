'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import type { Layout } from '@/lib/layout';
import type { Focus } from '@/lib/route';
import { drawHall, hallBounds, readPalette, type Palette } from '@/lib/hallDraw';

export type MapView = { k: number; x: number; y: number };
export type HallCanvasApi = { draw: (v: MapView) => void };

type Stats = { last: number; max: number };
const stats = () => ((window as unknown as { __hall?: Stats }).__hall ??= { last: 0, max: 0 });

/**
 * The hall on a canvas. A real hall has thousands of chairs, too many to redraw on every frame of a pinch,
 * so while the view is moving we just slide and scale a picture of the last sharp drawing (one cheap GPU copy),
 * then redraw the vectors a moment after the gesture settles.
 */
const HallCanvas = forwardRef<HallCanvasApi, { layout: Layout; focus?: Focus | null; label: string }>(
  function HallCanvas({ layout, focus, label }, ref) {
    const cv = useRef<HTMLCanvasElement>(null);
    const view = useRef<MapView>({ k: 1, x: 0, y: 0 });
    const pal = useRef<Palette | null>(null);
    const ov = useRef<HTMLCanvasElement>(null);
    const snap = useRef<HTMLCanvasElement | null>(null);
    const snapView = useRef<MapView>({ k: 1, x: 0, y: 0 });
    const settle = useRef<number | undefined>(undefined);

    /** Maps meters to pixels for the current view (the hall "meets" the screen at zoom 1); returns pixels per meter. */
    const place = useCallback(
      (ctx: CanvasRenderingContext2D, c: HTMLCanvasElement, w: number, h: number, dpr: number) => {
        const b = hallBounds(layout, focus);
        const fit = Math.min(w / b.w, h / b.h);
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
        return s;
      },
      [layout, focus],
    );

    /** The animated route, rings and seat dot: a few shapes on their own canvas, so a frame stays cheap. */
    const overlayFrame = useCallback(
      (t: number) => {
        const c = ov.current,
          base = cv.current;
        if (!c || !base || !focus || !pal.current) return;
        const w = base.clientWidth,
          h = base.clientHeight;
        if (c.width !== base.width || c.height !== base.height) {
          c.width = base.width;
          c.height = base.height;
        }
        const ctx = c.getContext('2d');
        if (!ctx) return;
        const s = place(ctx, c, w, h, base.width / w);
        drawHall(ctx, layout, focus, pal.current, s, 'overlay', t);
      },
      [layout, focus, place],
    );

    /** The sharp drawing at the current view; also kept as the picture used while moving. */
    const sharp = useCallback(() => {
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
      const s = place(ctx, c, w, h, dpr);
      drawHall(ctx, layout, focus, pal.current, s, 'base');
      // keep a copy to slide around while the view moves
      const sn = (snap.current ??= document.createElement('canvas'));
      if (sn.width !== c.width || sn.height !== c.height) {
        sn.width = c.width;
        sn.height = c.height;
      }
      const sc = sn.getContext('2d');
      if (sc) {
        sc.setTransform(1, 0, 0, 1, 0, 0);
        sc.clearRect(0, 0, sn.width, sn.height);
        sc.drawImage(c, 0, 0);
      }
      snapView.current = { ...view.current };
      overlayFrame(performance.now() / 1000);
      const dt = performance.now() - t0;
      const st = stats();
      st.last = dt;
      st.max = Math.max(st.max * 0.98, dt);
    }, [layout, focus, place, overlayFrame]);

    /** The saved picture moved and scaled to the current view: cheap, a little soft until it settles. */
    const slide = useCallback(() => {
      const c = cv.current,
        sn = snap.current;
      if (!c || !sn || sn.width !== c.width || sn.height !== c.height) return sharp();
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const t0 = performance.now();
      const v = view.current,
        v0 = snapView.current;
      const r = v.k / v0.k;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      const dpr = c.width / c.clientWidth;
      ctx.setTransform(r, 0, 0, r, (v.x - r * v0.x) * dpr, (v.y - r * v0.y) * dpr);
      ctx.drawImage(sn, 0, 0);
      const st = stats();
      st.last = performance.now() - t0;
    }, [sharp]);

    useImperativeHandle(ref, () => ({
      draw: (v) => {
        view.current = v;
        slide();
        window.clearTimeout(settle.current);
        settle.current = window.setTimeout(sharp, 140);
      },
    }));

    // animate the route, rings and seat dot on the overlay; still when the person asks for reduced motion
    useEffect(() => {
      if (!focus) return;
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let raf = 0;
      const loop = (now: number) => {
        overlayFrame(still ? 0 : now / 1000);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(raf);
    }, [focus, overlayFrame]);

    useEffect(() => {
      sharp();
      const c = cv.current;
      if (!c) return;
      const ro = new ResizeObserver(sharp);
      ro.observe(c);
      return () => {
        ro.disconnect();
        window.clearTimeout(settle.current);
      };
    }, [sharp]);

    return (
      <div className="hall-canvas" role="img" aria-label={label}>
        <canvas ref={cv} />
        <canvas ref={ov} className="hall-canvas-ov" />
      </div>
    );
  },
);
export default HallCanvas;
