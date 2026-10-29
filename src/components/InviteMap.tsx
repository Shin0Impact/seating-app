'use client';

import { useMemo } from 'react';
import HallPreview from './HallPreview';
import ZoomPan from './ZoomPan';
import { useS } from './LangProvider';
import { seatsSummary } from '@/lib/invites';
import type { Layout } from '@/lib/layout';
import { buildFocus } from '@/lib/route';

function Body({ layout, ids, label }: { layout: Layout; ids: string[]; label: string }) {
  // the walking route is only worked out when the map is actually opened
  const focus = useMemo(() => buildFocus(layout, ids), [layout, ids]);
  return <HallPreview layout={layout} label={label} focus={focus} />;
}

/** Planner's view of where one invitation (the head and everyone on it) sits, with the walk from the entrance. */
export default function InviteMap({ layout, ids }: { layout: Layout; ids: string[] }) {
  const s = useS();
  const text = useMemo(
    () => seatsSummary(layout, ids, (table, n, chairs) => s('tableChairs', { table, word: n === 1 ? s('chairOne') : s('chairMany'), chairs }), s('andWord')),
    [layout, ids, s],
  );
  if (!text) return null;
  return (
    <ZoomPan small label={text}>
      <Body layout={layout} ids={ids} label={text} />
    </ZoomPan>
  );
}
