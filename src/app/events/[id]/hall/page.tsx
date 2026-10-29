import { notFound } from 'next/navigation';
import EventEditor from '@/components/EventEditor';
import { parseLayout } from '@/lib/layout';
import { serverClient } from '@/lib/supabase/server';

export default async function HallPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  const { id } = await params;
  const { focus } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await serverClient();
  const { data } = await supabase.from('events').select('id,name,layout,version').eq('id', id).maybeSingle();
  if (!data) notFound();
  return (
    <EventEditor
      id={data.id}
      name={data.name}
      initial={parseLayout(data.layout)}
      version={data.version}
      focusGuest={focus}
    />
  );
}
