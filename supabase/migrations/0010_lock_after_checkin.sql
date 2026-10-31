-- A family can change its answer (the app asks "are you sure?" first), until the invitation closes:
-- once the guest has been scanned at the door, or from the day of the event (Israel time).
-- Unanswered invitations can still be answered on the day.
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
     and (i.status = 'pending'
          or not (i.checked_in_at is not null
                  or (e.event_date is not null and e.event_date <= (now() at time zone 'Asia/Jerusalem')::date)));
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
     and i.checked_in_at is null
     and not (e.event_date is not null and e.event_date <= (now() at time zone 'Asia/Jerusalem')::date)
     and p_count is distinct from (coalesce(i.confirmed_count, 0) + i.extra_requested);
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
