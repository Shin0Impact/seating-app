-- Seating app: planners (Supabase Auth users) own events; guests get a secret link and a QR code.
-- Run this once in the Supabase SQL editor (or with `supabase db push`).

create table public.events (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name       text not null check (char_length(name) between 1 and 120),
  event_date date,
  -- The whole hall plan: { version, settings, elements, guests } (same JSON the editor already uses).
  layout     jsonb not null,
  -- Bumped on every save; a save that used an old version is refused, so two tabs cannot overwrite each other.
  version    integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index events_owner_idx on public.events (owner_id, updated_at desc);

create table public.invites (
  token         text primary key check (char_length(token) between 20 and 64),
  event_id      uuid not null references public.events (id) on delete cascade,
  -- The named guest and anyone who comes with them ("Name +1"...), as ids inside events.layout.guests.
  guest_id      uuid not null,
  member_ids    uuid[] not null default '{}',
  party_size    integer not null default 1 check (party_size between 1 and 50),
  status        text not null default 'pending' check (status in ('pending', 'confirmed', 'declined')),
  confirmed_count integer check (confirmed_count between 0 and 50),
  responded_at  timestamptz,
  checked_in_at timestamptz,
  created_at    timestamptz not null default now(),
  unique (event_id, guest_id)
);
create index invites_event_idx on public.invites (event_id);

alter table public.events  enable row level security;
alter table public.invites enable row level security;

-- Planners: full access to their own events, and to the invites of those events. Nobody else, ever.
create policy events_owner on public.events
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy invites_owner on public.invites
  for all to authenticated
  using (exists (select 1 from public.events e where e.id = invites.event_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = invites.event_id and e.owner_id = auth.uid()));

-- Guests are not logged in. They only reach their own invite through these two functions, by secret token.
-- They never see the layout, other guests, or the table they are seated at.
create or replace function public.rsvp_get(p_token text)
returns table (guest_name text, event_name text, event_date date, status text, party_size integer, confirmed_count integer)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(e.layout -> 'guests' -> idx.i ->> 'name', '') as guest_name,
    e.name, e.event_date, i.status, i.party_size, i.confirmed_count
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

create or replace function public.rsvp_set(p_token text, p_status text, p_count integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if p_status not in ('confirmed', 'declined') then return false; end if;
  update public.invites
     set status = p_status,
         confirmed_count = case when p_status = 'confirmed' then least(greatest(coalesce(p_count, party_size), 1), party_size) else 0 end,
         responded_at = now()
   where token = p_token;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

revoke all on function public.rsvp_get(text) from public;
revoke all on function public.rsvp_set(text, text, integer) from public;
grant execute on function public.rsvp_get(text)  to anon, authenticated;
grant execute on function public.rsvp_set(text, text, integer) to anon, authenticated;
