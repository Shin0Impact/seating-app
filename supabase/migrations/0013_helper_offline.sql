-- Door helpers working without signal: their phone queues taps and sends them later. So that a guest marked at
-- 20:05 offline still shows 20:05, the time of the tap is sent along (p_at). A walk-in carries a key made on the
-- phone (p_key), so sending it twice (a retry after a dropped connection) never adds the guest twice.

drop function if exists public.helper_scan(text, text);
drop function if exists public.helper_checkin(text, text, integer, boolean);
drop function if exists public.helper_add_walkin(text, text, integer);

-- the time of a tap: what the phone says, but never in the future and never more than a day back
create or replace function public.helper_when(p_at timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case when p_at is null or p_at > now() or p_at < now() - interval '1 day' then now() else p_at end;
$$;

create or replace function public.helper_scan(p_token text, p_invite text, p_at timestamptz default null)
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
    update public.invites set checked_in_at = public.helper_when(p_at) where token = r.token returning * into r;
  end if;
  return jsonb_build_object('ok', true, 'already', was, 'status', r.status, 'party_size', r.party_size,
    'confirmed_count', r.confirmed_count, 'guest_id', r.guest_id, 'member_ids', r.member_ids);
end;
$$;

create or replace function public.helper_checkin(p_token text, p_invite text, p_count integer, p_undo boolean default false,
                                                 p_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev uuid;
  r public.invites%rowtype;
  n integer := greatest(1, least(50, coalesce(p_count, 1)));
  t timestamptz := public.helper_when(p_at);
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
      checked_in_at = coalesce(checked_in_at, t),
      sent_at = coalesce(sent_at, t),
      status = 'confirmed',
      confirmed_count = n,
      change_requested_at = null,
      responded_at = case when status = 'confirmed' then coalesce(responded_at, t) else t end
    where token = r.token;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.helper_add_walkin(p_token text, p_name text, p_count integer,
                                                    p_key uuid default null, p_at timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ev public.events%rowtype;
  nm text := left(trim(coalesce(p_name, '')), 56);
  n integer := greatest(1, least(50, coalesce(p_count, 1)));
  head uuid := coalesce(p_key, gen_random_uuid());
  tok text := replace(head::text, '-', '');
  t timestamptz := public.helper_when(p_at);
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
  -- already added (this is a retry): nothing to do
  if exists (select 1 from public.invites where token = tok) then return jsonb_build_object('ok', true); end if;
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
    values (tok, ev.id, head, ids, n, 'confirmed', n, t, t, t)
    on conflict (token) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.helper_when(timestamptz) from public;
revoke all on function public.helper_scan(text, text, timestamptz) from public;
revoke all on function public.helper_checkin(text, text, integer, boolean, timestamptz) from public;
revoke all on function public.helper_add_walkin(text, text, integer, uuid, timestamptz) from public;
grant execute on function public.helper_scan(text, text, timestamptz) to anon, authenticated;
grant execute on function public.helper_checkin(text, text, integer, boolean, timestamptz) to anon, authenticated;
grant execute on function public.helper_add_walkin(text, text, integer, uuid, timestamptz) to anon, authenticated;
