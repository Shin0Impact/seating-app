import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import InvitesPanel, { type InviteRow } from '@/components/InvitesPanel';
import { parseLayout } from '@/lib/layout';
import { serverClient } from '@/lib/supabase/server';

export default async function InvitesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await serverClient();
  const { data: ev } = await supabase.from('events').select('id,name,layout').eq('id', id).maybeSingle();
  if (!ev) notFound();
  const { data: invites } = await supabase.from('invites').select('token,guest_id,party_size,status,confirmed_count,checked_in_at').eq('event_id', id).order('created_at');
  const h = await headers();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  return (
    <main className="page">
      <div className="row between"><h1>الدعوات — {ev.name}</h1><Link href={`/events/${id}`}>← المخطط</Link></div>
      <InvitesPanel eventId={id} guests={parseLayout(ev.layout).guests} initial={(invites ?? []) as InviteRow[]} siteUrl={siteUrl.replace(/\/$/, '')} />
    </main>
  );
}
