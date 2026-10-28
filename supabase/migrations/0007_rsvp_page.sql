-- Time and place of the event, shown on the invite page.
alter table public.events add column if not exists event_time text;
alter table public.events add column if not exists venue text;
alter table public.events add column if not exists venue_url text;

-- A confirmed family can change its head count at any time (more or fewer); the planner is told.
alter table public.invites add column if not exists extra_requested integer not null default 0 check (extra_requested between 0 and 70);
alter table public.invites drop constraint if exists invites_extra_requested_check;
alter table public.invites add constraint invites_extra_requested_check check (extra_requested between 0 and 70);
alter table public.invites add column if not exists count_changed_to integer;
alter table public.invites add column if not exists count_changed_at timestamptz;

drop function if exists public.rsvp_get(text);
create or replace function public.rsvp_get(p_token text)
returns table (guest_name text, event_name text, event_date date, status text, party_size integer, confirmed_count integer,
               event_time text, venue text, venue_url text, extra_requested integer)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(e.layout -> 'guests' -> idx.i ->> 'name', '') as guest_name,
    e.name, e.event_date, i.status, i.party_size, i.confirmed_count,
    e.event_time, e.venue, e.venue_url, i.extra_requested
  from public.invites i
  join public.events e on e.id = i.event_id
  left join lateral (
    select (ord - 1)::int as i
    from jsonb_array_elements(e.layout -> 'guests') with ordinality as t(g, ord)
    where t.g ->> 'id' = i.guest_id::text
    limit 1
  ) idx on true
  where i.token = p_token;
$$;

create or replace function public.rsvp_change_count(p_token text, p_count integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if p_count is null or p_count < 1 or p_count > 70 then return false; end if;
  update public.invites
     set confirmed_count = least(p_count, party_size),
         extra_requested = greatest(p_count - party_size, 0),
         count_changed_to = p_count,
         count_changed_at = now()
   where token = p_token
     and status = 'confirmed'
     and p_count is distinct from (coalesce(confirmed_count, 0) + extra_requested);
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

revoke all on function public.rsvp_get(text) from public;
revoke all on function public.rsvp_change_count(text, integer) from public;
grant execute on function public.rsvp_get(text) to anon, authenticated;
grant execute on function public.rsvp_change_count(text, integer) to anon, authenticated;
