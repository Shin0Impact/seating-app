'use server';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';

export async function signOut() {
  await (await serverClient()).auth.signOut();
  redirect('/');
}

/** Deletes an event and (by cascade) all its invites. The typed name must match, so a stray click can't do it. */
export async function deleteEvent(form: FormData) {
  const id = String(form.get('id') ?? '');
  const typed = String(form.get('confirm') ?? '').trim();
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect('/events');
  const supabase = await serverClient();
  const { data: ev } = await supabase.from('events').select('name').eq('id', id).maybeSingle();
  if (!ev) redirect('/events');
  if (typed !== ev.name.trim()) redirect(`/events/${id}?delete=mismatch`);
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) redirect(`/events/${id}?delete=error`);
  redirect('/events?deleted=1');
}
