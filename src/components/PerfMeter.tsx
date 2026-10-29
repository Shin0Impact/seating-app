'use client';
import { useEffect, useState } from 'react';

type Long = { at: number; dur: number; block: number; what: string };

/** Debug overlay, only shown with ?perf=1: frame rate, worst frame in the last 3 s, and what caused each stall. */
export default function PerfMeter() {
  const [text, setText] = useState('measuring...');
  useEffect(() => {
    const frames: { t: number; d: number }[] = [];
    const longs: Long[] = [];
    let last = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      frames.push({ t, d: t - last });
      last = t;
      while (frames.length && t - frames[0].t > 3000) frames.shift();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const observers: PerformanceObserver[] = [];
    const watch = (type: string) => {
      try {
        const po = new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            const x = e as PerformanceEntry & {
              blockingDuration?: number;
              scripts?: { invoker?: string; sourceURL?: string; sourceFunctionName?: string; duration?: number }[];
            };
            const what = (x.scripts ?? [])
              .map(
                (s) =>
                  `${s.invoker ?? ''} ${s.sourceFunctionName ?? ''} ${(s.sourceURL ?? '').split('/').pop()} ${Math.round(s.duration ?? 0)}ms`,
              )
              .join(' | ');
            longs.push({
              at: e.startTime,
              dur: e.duration,
              block: x.blockingDuration ?? 0,
              what: type === 'longtask' ? 'longtask' : what || 'no script (render/paint)',
            });
            if (longs.length > 6) longs.shift();
          }
        });
        po.observe({ type, buffered: false });
        observers.push(po);
      } catch {
        /* not supported in this browser */
      }
    };
    watch('long-animation-frame');
    watch('longtask');
    const id = window.setInterval(() => {
      const worst = frames.reduce((m, f) => Math.max(m, f.d), 0);
      const spikes = frames.filter((f) => f.d > 40).map((f) => (f.t / 1000).toFixed(1) + 's/' + Math.round(f.d) + 'ms');
      const h = (window as unknown as { __hall?: { last: number; max: number } }).__hall;
      setText(
        [
          `fps ${(frames.length / 3).toFixed(0)}  worst frame ${worst.toFixed(0)}ms`,
          `canvas draw last ${h ? h.last.toFixed(1) : '-'}ms  max ${h ? h.max.toFixed(1) : '-'}ms`,
          `spikes(>40ms): ${spikes.join(' ') || 'none'}`,
          `dpr ${window.devicePixelRatio}  screen ${screen.width}x${screen.height}  ${navigator.userAgent.slice(-60)}`,
          ...longs.map(
            (l) => `${(l.at / 1000).toFixed(1)}s ${Math.round(l.dur)}ms blk${Math.round(l.block)} ${l.what}`,
          ),
        ].join('\n'),
      );
    }, 500);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
      observers.forEach((o) => o.disconnect());
    };
  }, []);
  return (
    <pre
      style={{
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        zIndex: 2000,
        margin: 0,
        padding: 8,
        font: '11px/1.35 monospace',
        background: 'rgba(0,0,0,.78)',
        color: '#9cf59c',
        pointerEvents: 'none',
        whiteSpace: 'pre-wrap',
        direction: 'ltr',
        textAlign: 'left',
      }}
    >
      {text}
    </pre>
  );
}
