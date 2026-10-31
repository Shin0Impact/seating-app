-- A family can change its answer (the app asks "are you sure?" first) until the event starts: from the event's date and
-- time (Israel time; midnight if no valid time is set) the answers are closed. Unanswered invitations can still be answered.
create or replace function public.event_started(p_date date, p_time text)
returns boolean
language sql
stable
as $$
  select p_date is not null
     and (p_date + case when coalesce(p_time, '') ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then p_time::time else time '00:00' end)
         <= (now() at time zone 'Asia/Jerusalem');
$$;

create or replace function public.rsvp_set(p_token text, p_status text, p_count integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if p_status not in ('confirmed', 'declined', 'pending') then return false; end if;
  update public.invites i
     set status = p_status,
         confirmed_count = case
           when p_status = 'confirmed' then least(greatest(coalesce(p_count, i.party_size), 1), i.party_size)
           when p_status = 'declined' then 0
           else null end,
         responded_at = case when p_status = 'pending' then null else now() end,
         change_requested_at = case when p_status = 'pending' then now() else null end
    from public.events e
   where e.id = i.event_id
     and i.token = p_token
     and (i.status = 'pending' or not public.event_started(e.event_date, e.event_time));
  get diagnostics n = row_count;
  return n = 1;
end;
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
  update public.invites i
     set confirmed_count = least(p_count, i.party_size),
         extra_requested = greatest(p_count - i.party_size, 0),
         count_changed_to = p_count,
         count_changed_at = now()
    from public.events e
   where e.id = i.event_id
     and i.token = p_token
     and i.status = 'confirmed'
     and not public.event_started(e.event_date, e.event_time)
     and p_count is distinct from (coalesce(i.confirmed_count, 0) + i.extra_requested);
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
