import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import InvitesPanel from '@/components/InvitesPanel';
import { SiteHeader, StepBar } from '@/components/Site';
import type { InviteRow } from '@/lib/inviteview';
import { parseLayout } from '@/lib/layout';
import { serverClient } from '@/lib/supabase/server';
import { getS } from '@/lib/lang-server';

export async function generateMetadata() {
  const { s } = await getS();
  return { title: `${s('titleInvites')} · ${s('brand')}` };
}

export default async function InvitesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { s } = await getS();
  const supabase = await serverClient();
  const { data: ev } = await supabase.from('events').select('id,name,layout').eq('id', id).maybeSingle();
  if (!ev) notFound();
  const { data: invites } = await supabase.from('invites').select('*').eq('event_id', id).order('created_at');
  const h = await headers();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`).replace(/\/$/, '');
  return (
    <div className="site">
      <SiteHeader crumb={{ id, name: ev.name }} />
      <main className="container">
        <div className="page-title"><h1>{s('invitesTitle')}</h1></div>
        <StepBar id={id} active="invites" />
        <InvitesPanel eventId={id} eventName={ev.name} initialGuests={parseLayout(ev.layout).guests} initial={(invites ?? []) as InviteRow[]} siteUrl={siteUrl} />
      </main>
    </div>
  );
}
