'use server';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';
import { isValidUsername, normalizeUsername } from '@/lib/username';

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

/** Sets or changes the signed-in planner's username. */
export async function setUsername(form: FormData) {
  const name = normalizeUsername(String(form.get('username') ?? ''));
  if (!isValidUsername(name)) redirect('/events?username=invalid');
  const supabase = await serverClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) redirect('/');
  const { data: existing } = await supabase.from('profiles').select('user_id').eq('user_id', u.user.id).maybeSingle();
  const { error } = existing
    ? await supabase.from('profiles').update({ username: name }).eq('user_id', u.user.id)
    : await supabase.from('profiles').insert({ username: name });
  if (error) redirect(`/events?username=${error.code === '23505' ? 'taken' : 'error'}`);
  redirect('/events?username=saved');
}
