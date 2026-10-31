-- Door helpers: the planner makes a secret helper link per event. Whoever holds it can scan guests, search names,
-- mark people as arrived (with a count, and undo it) and add walk-ins. Nothing else: no sure/maybe, no groups,
-- no editing of the plan. Turning the link off or making a new one stops the old one at once.

alter table public.events add column if not exists helper_token text unique
  check (helper_token is null or char_length(helper_token) between 24 and 64);

-- What a helper may see: names, table and chair, the hall's shapes, and each invite's arrival state.
create or replace function public.helper_get(p_token text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'name', e.name,
    'layout', jsonb_build_object(
      'version', 1,
      'settings', e.layout -> 'settings',
      'elements', e.layout -> 'elements',
      'guests', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', g -> 'id', 'name', g -> 'name', 'group', '',
          'tableId', g -> 'tableId', 'seat', g -> 'seat',
          'stepFree', coalesce(g -> 'stepFree', 'false'::jsonb)))
        from jsonb_array_elements(coalesce(e.layout -> 'guests', '[]'::jsonb)) g), '[]'::jsonb)),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object(
        'token', i.token, 'guest_id', i.guest_id, 'member_ids', i.member_ids, 'party_size', i.party_size,
        'status', i.status, 'confirmed_count', i.confirmed_count, 'checked_in_at', i.checked_in_at,
        'sent_at', i.sent_at, 'responded_at', i.responded_at))
      from public.invites i where i.event_id = e.id), '[]'::jsonb))
  from public.events e
  where p_token is not null and e.helper_token = p_token;
$$;

-- A scanned QR code: marks the invite as arrived (only fills an empty time) and returns it.
create or replace function public.helper_scan(p_token text, p_invite text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev uuid;
  r public.invites%rowtype;
  was timestamptz;
begin
  select id into ev from public.events where p_token is not null and helper_token = p_token;
  if ev is null then return jsonb_build_object('error', 'helper'); end if;
  select * into r from public.invites where token = p_invite and event_id = ev;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  was := r.checked_in_at;
  if was is null then
    update public.invites set checked_in_at = now() where token = r.token returning * into r;
  end if;
  return jsonb_build_object('ok', true, 'already', was, 'status', r.status, 'party_size', r.party_size,
    'confirmed_count', r.confirmed_count, 'guest_id', r.guest_id, 'member_ids', r.member_ids);
end;
$$;

-- Manual check-in with the number who really came (what the planner's Arrived button does), or taking it back.
create or replace function public.helper_checkin(p_token text, p_invite text, p_count integer, p_undo boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev uuid;
  r public.invites%rowtype;
  n integer := greatest(1, least(50, coalesce(p_count, 1)));
begin
  select id into ev from public.events where p_token is not null and helper_token = p_token;
  if ev is null then return jsonb_build_object('error', 'helper'); end if;
  select * into r from public.invites where token = p_invite and event_id = ev for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if p_undo then
    update public.invites set
      checked_in_at = null,
      status = case when responded_at is not distinct from checked_in_at then 'pending' else status end,
      confirmed_count = case when responded_at is not distinct from checked_in_at then null else confirmed_count end,
      sent_at = case when sent_at is not distinct from checked_in_at then null else sent_at end,
      responded_at = case when responded_at is not distinct from checked_in_at then null else responded_at end
    where token = r.token;
  else
    update public.invites set
      checked_in_at = coalesce(checked_in_at, now()),
      sent_at = coalesce(sent_at, now()),
      status = 'confirmed',
      confirmed_count = n,
      change_requested_at = null,
      responded_at = case when status = 'confirmed' then coalesce(responded_at, now()) else now() end
    where token = r.token;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Someone who was not invited: adds them (and the people with them) to the plan, unseated, already arrived.
create or replace function public.helper_add_walkin(p_token text, p_name text, p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events%rowtype;
  nm text := left(trim(coalesce(p_name, '')), 56);
  n integer := greatest(1, least(50, coalesce(p_count, 1)));
  head uuid := gen_random_uuid();
  ids uuid[] := '{}';
  guests jsonb;
  extra jsonb := '[]'::jsonb;
  grp text := 'Walk-in · بدون دعوة';
  i integer;
  mid uuid;
begin
  select * into ev from public.events where p_token is not null and helper_token = p_token for update;
  if ev.id is null then return jsonb_build_object('error', 'helper'); end if;
  if nm = '' then return jsonb_build_object('error', 'name'); end if;
  guests := coalesce(ev.layout -> 'guests', '[]'::jsonb);
  if jsonb_array_length(guests) + n > 2000 then return jsonb_build_object('error', 'full'); end if;
  extra := extra || jsonb_build_object('id', head, 'name', nm, 'group', grp, 'tableId', null, 'seat', null, 'stepFree', false);
  for i in 1 .. n - 1 loop
    mid := gen_random_uuid();
    ids := ids || mid;
    extra := extra || jsonb_build_object('id', mid, 'name', nm || ' +' || i, 'group', grp, 'tableId', null, 'seat', null, 'stepFree', false);
  end loop;
  update public.events
    set layout = jsonb_set(layout, '{guests}', guests || extra), version = version + 1, updated_at = now()
    where id = ev.id;
  insert into public.invites (token, event_id, guest_id, member_ids, party_size, status, confirmed_count,
                              responded_at, checked_in_at, sent_at)
    values (replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), ev.id, head, ids, n,
            'confirmed', n, now(), now(), now());
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.helper_get(text) from public;
revoke all on function public.helper_scan(text, text) from public;
revoke all on function public.helper_checkin(text, text, integer, boolean) from public;
revoke all on function public.helper_add_walkin(text, text, integer) from public;
grant execute on function public.helper_get(text) to anon, authenticated;
grant execute on function public.helper_scan(text, text) to anon, authenticated;
grant execute on function public.helper_checkin(text, text, integer, boolean) to anon, authenticated;
grant execute on function public.helper_add_walkin(text, text, integer) to anon, authenticated;
