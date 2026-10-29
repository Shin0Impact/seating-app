import { chairSlots, tableDims, toWorld, type Layout } from '@/lib/layout';
import type { Focus } from '@/lib/route';

/** Read-only picture of the hall, drawn as plain SVG so it needs no client code. */
export default function HallPreview({ layout, label, focus }: { layout: Layout; label: string; focus?: Focus | null }) {
  const { elements, guests, settings } = layout;
  if (!elements.length) return null;
  const seatedAt = new Map<string, Set<number>>();
  for (const g of guests) if (g.tableId && g.seat != null) (seatedAt.get(g.tableId) ?? seatedAt.set(g.tableId, new Set()).get(g.tableId)!).add(g.seat);

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number, r: number) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  for (const e of elements) {
    if (e.kind === 'table') { const d = tableDims(e, settings); grow(e.x, e.y, (d.shape === 'round' ? d.diameter / 2 : Math.max(d.length, d.width) / 2) + settings.chairDepth + 0.3); }
    else if (e.kind === 'column') grow(e.x, e.y, e.size / 2);
    else grow(e.x, e.y, Math.max(e.w, e.h) / 2 + 0.2);
  }
  for (const p of focus?.route ?? []) grow(p.x, p.y, 0.6);
  const pad = 1;
  const vb = `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`;
  const fs = 0.45;
  const marked = new Set(focus?.tableIds ?? []);
  const dim = !!focus;

  return (
    <svg className="hall-preview" viewBox={vb} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {elements.map((e) => {
        if (e.kind === 'table') {
          const d = tableDims(e, settings);
          const taken = seatedAt.get(e.id);
          return (
            <g key={e.id} className={dim && !marked.has(e.id) ? 'hp-dim' : undefined}>
              {marked.has(e.id) && (d.shape === 'round'
                ? <circle cx={e.x} cy={e.y} r={d.diameter / 2 + settings.chairDepth + 0.45} className="hp-ring" />
                : <rect x={-d.length / 2 - 0.45} y={-d.width / 2 - settings.chairDepth - 0.45} width={d.length + 0.9} height={d.width + settings.chairDepth * 2 + 0.9} rx={0.5} className="hp-ring" transform={`translate(${e.x} ${e.y}) rotate(${e.rotation})`} />)}
              {chairSlots(e, settings).map((c, i) => {
                const p = toWorld(e, c.x, c.y);
                return <circle key={i} cx={p.x} cy={p.y} r={settings.seatWidth * 0.36} className={taken?.has(i) ? 'hp-chair on' : 'hp-chair'} />;
              })}
              {d.shape === 'round'
                ? <circle cx={e.x} cy={e.y} r={d.diameter / 2} className="hp-table" />
                : <rect x={-d.length / 2} y={-d.width / 2} width={d.length} height={d.width} rx={0.1} className="hp-table" transform={`translate(${e.x} ${e.y}) rotate(${e.rotation})`} />}
              <text x={e.x} y={e.y} className="hp-text" fontSize={fs} textAnchor="middle" dominantBaseline="central">{e.label}</text>
            </g>
          );
        }
        if (e.kind === 'column')
          return e.shape === 'circle'
            ? <circle key={e.id} cx={e.x} cy={e.y} r={e.size / 2} className="hp-col" />
            : <rect key={e.id} x={-e.size / 2} y={-e.size / 2} width={e.size} height={e.size} className="hp-col" transform={`translate(${e.x} ${e.y}) rotate(${e.rotation})`} />;
        if (e.kind === 'marker' && e.marker === 'walkway') return null;
        if (e.kind === 'zone') {
          // guests only need the stairs, not the raised area itself
          if (e.steps <= 0) return null;
          // a small staircase symbol centred on the stair line (the steps run along the bottom edge)
          const k = Math.min(1.1, Math.max(0.6, Math.min(e.w, e.h) * 0.35)) / 1.1;
          return (
            <g key={e.id} transform={`translate(${e.x} ${e.y}) rotate(${e.rotation}) translate(0 ${e.h / 2 + (0.28 * e.steps) / 2}) rotate(${-e.rotation}) scale(${k})`} aria-hidden>
              <circle r={0.78} className="hp-stairs-bg" />
              <path d="M -0.5 0.4 H -0.17 V 0.1 H 0.17 V -0.2 H 0.5 V -0.5" className="hp-stairs-icon" />
            </g>
          );
        }
        return (
          <g key={e.id} transform={`translate(${e.x} ${e.y}) rotate(${e.rotation})`}>
            <rect x={-e.w / 2} y={-e.h / 2} width={e.w} height={e.h} rx={0.15} className={e.marker === 'exit' ? 'hp-exit' : 'hp-marker'} />
            {e.label && <text className="hp-text" fontSize={fs} textAnchor="middle" dominantBaseline="central">{e.label}</text>}
          </g>
        );
      })}
      {focus?.route && <polyline points={focus.route.map((p) => `${p.x},${p.y}`).join(' ')} className="hp-route" />}
      {focus?.start && <circle cx={focus.start.x} cy={focus.start.y} r={0.4} className="hp-start" />}
      {focus?.chair && <circle cx={focus.chair.x} cy={focus.chair.y} r={0.5} className="hp-you" />}
    </svg>
  );
}
