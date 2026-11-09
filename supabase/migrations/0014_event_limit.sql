-- Each account can make one event. To let an account have more, give it its own limit, for example:
--   insert into public.account_limits (user_id, max_events)
--   select id, 5 from auth.users where email = 'someone@example.com'
--   on conflict (user_id) do update set max_events = excluded.max_events;
-- Accounts that already have more events keep them; they just cannot add another.

create table if not exists public.account_limits (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  max_events integer not null default 1 check (max_events >= 0)
);
alter table public.account_limits enable row level security;
drop policy if exists account_limits_read_own on public.account_limits;
create policy account_limits_read_own on public.account_limits
  for select to authenticated using (user_id = auth.uid());

-- How many events this account may have (1 unless it was given more).
create or replace function public.my_event_limit()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select max_events from public.account_limits where user_id = auth.uid()), 1);
$$;
grant execute on function public.my_event_limit() to authenticated;

create or replace function public.enforce_event_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim integer;
  have integer;
begin
  -- one at a time per account, so two quick clicks cannot both get in
  perform pg_advisory_xact_lock(hashtext('event_limit:' || new.owner_id::text));
  lim := coalesce((select max_events from public.account_limits where user_id = new.owner_id), 1);
  select count(*) into have from public.events where owner_id = new.owner_id;
  if have >= lim then
    raise exception 'event_limit' using errcode = 'P0001', hint = 'This account has reached its number of events.';
  end if;
  return new;
end;
$$;

drop trigger if exists events_limit on public.events;
create trigger events_limit
  before insert on public.events
  for each row execute function public.enforce_event_limit();
