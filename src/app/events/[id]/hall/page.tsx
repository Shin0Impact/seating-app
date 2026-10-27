import { notFound } from 'next/navigation';
import EventEditor from '@/components/EventEditor';
import { parseLayout } from '@/lib/layout';
import { serverClient } from '@/lib/supabase/server';
import { displayName } from '@/lib/username';

export default async function HallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await serverClient();
  const { data } = await supabase.from('events').select('id,name,layout,version').eq('id', id).maybeSingle();
  if (!data) notFound();
  const { data: u } = await supabase.auth.getUser();
  return <EventEditor user={displayName(u.user?.email)} id={data.id} name={data.name} initial={parseLayout(data.layout)} version={data.version} />;
}
