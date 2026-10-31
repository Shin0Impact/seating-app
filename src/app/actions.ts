'use server';
import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';
import { isValidUsername, normalizeUsername } from '@/lib/username';
import { DEFAULT_OPTIONS, parseLayout } from '@/lib/layout';

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

export type UsernameResult = 'saved' | 'taken' | 'invalid' | 'error';

/** Sets or changes the signed-in planner's username. */
export async function updateUsername(raw: string): Promise<UsernameResult> {
  const name = normalizeUsername(String(raw ?? ''));
  if (!isValidUsername(name)) return 'invalid';
  const supabase = await serverClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) redirect('/');
  const { data: existing } = await supabase.from('profiles').select('user_id').eq('user_id', u.user.id).maybeSingle();
  const { error } = existing
    ? await supabase.from('profiles').update({ username: name }).eq('user_id', u.user.id)
    : await supabase.from('profiles').insert({ username: name });
  if (error) return error.code === '23505' ? 'taken' : 'error';
  return 'saved';
}

/** Renames an event and/or changes its date. */
export async function renameEvent(form: FormData) {
  const id = String(form.get('id') ?? '');
  const name = String(form.get('name') ?? '')
    .trim()
    .slice(0, 120);
  const date = String(form.get('date') ?? '');
  const time = String(form.get('time') ?? '');
  const venue = String(form.get('venue') ?? '')
    .trim()
    .slice(0, 200);
  const venueUrl = String(form.get('venue_url') ?? '')
    .trim()
    .slice(0, 500);
  if (!/^[0-9a-f-]{36}$/.test(id)) redirect('/events');
  if (!name) redirect(`/events/${id}?rename=invalid`);
  const supabase = await serverClient();
  const { error } = await supabase
    .from('events')
    .update({
      name,
      event_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      event_time: /^\d{2}:\d{2}$/.test(time) ? time : null,
      venue: venue || null,
      venue_url: /^https?:\/\//i.test(venueUrl) ? venueUrl : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  const optErr = form.get('has_maybe_seats')
    ? await saveMaybeSeats(supabase, id, form.get('maybe_seats') === 'on')
    : null;
  redirect(`/events/${id}?rename=${error || optErr ? 'error' : 'saved'}`);
}

/**
 * Stores "maybe guests get a chair" inside the plan. The plan is re-read and only this option is changed, with the
 * same version check the editor uses, so nothing saved meanwhile is overwritten.
 */
async function saveMaybeSeats(supabase: Awaited<ReturnType<typeof serverClient>>, id: string, on: boolean) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: ev } = await supabase.from('events').select('layout,version').eq('id', id).maybeSingle();
    if (!ev) return 'missing';
    const layout = parseLayout(ev.layout);
    if ((layout.options?.maybeSeats ?? DEFAULT_OPTIONS.maybeSeats) === on) return null;
    const { data, error } = await supabase
      .from('events')
      .update({
        layout: { ...layout, options: { ...DEFAULT_OPTIONS, ...layout.options, maybeSeats: on } },
        version: ev.version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('version', ev.version)
      .select('version');
    if (error) return error.message;
    if (data && data.length > 0) return null;
  }
  return 'conflict';
}

export type PasswordResult = 'saved' | 'wrong' | 'short' | 'mismatch' | 'error';

/** Changes the signed-in planner's password after checking the current one. */
export async function updatePassword(current: string, next: string, again: string): Promise<PasswordResult> {
  if (String(next ?? '').length < 8) return 'short';
  if (next !== again) return 'mismatch';
  const supabase = await serverClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user?.email) redirect('/');
  const check = await supabase.auth.signInWithPassword({ email: u.user.email, password: String(current ?? '') });
  if (check.error) return 'wrong';
  const { error } = await supabase.auth.updateUser({ password: next });
  return error ? 'error' : 'saved';
}
