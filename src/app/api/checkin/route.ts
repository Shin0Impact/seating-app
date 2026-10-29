import { NextResponse } from 'next/server';
import { isToken, locate } from '@/lib/invites';
import { parseLayout } from '@/lib/layout';
import { buildFocus } from '@/lib/route';
import { serverClient } from '@/lib/supabase/server';

/** Door staff scan a guest's QR code; this marks them as arrived and says where to take them. Planner login required. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: unknown } | null;
  if (!body || !isToken(body.token)) return NextResponse.json({ error: 'bad_token' }, { status: 400 });
  const supabase = await serverClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'login' }, { status: 401 });

  // Row-level security: this only finds invites of events the logged-in planner owns.
  const { data: inv } = await supabase
    .from('invites')
    .select('token,event_id,guest_id,member_ids,party_size,status,confirmed_count,checked_in_at')
    .eq('token', body.token)
    .maybeSingle();
  if (!inv) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: ev } = await supabase.from('events').select('name,layout').eq('id', inv.event_id).single();
  if (!ev) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const already = inv.checked_in_at as string | null;
  if (!already)
    await supabase
      .from('invites')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('token', inv.token)
      .is('checked_in_at', null);

  const layout = parseLayout(ev.layout);
  const ids = [inv.guest_id, ...(inv.member_ids as string[])];
  const placements = locate(layout, ids);
  // The map shows only the hall's shapes, never other guests' names.
  const plan = { settings: layout.settings, elements: layout.elements };
  const focus = buildFocus(layout, ids);
  return NextResponse.json({
    ok: true,
    already,
    status: inv.status,
    partySize: inv.party_size,
    confirmedCount: inv.confirmed_count,
    event: ev.name,
    placements,
    plan,
    focus,
  });
}
