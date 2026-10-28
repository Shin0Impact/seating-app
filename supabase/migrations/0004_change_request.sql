-- A family can ask to change its answer. That sends the invite back to "unanswered" and flags it so the planner notices.
alter table public.invites add column if not exists change_requested_at timestamptz;

create or replace function public.rsvp_set(p_token text, p_status text, p_count integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if p_status not in ('confirmed', 'declined', 'pending') then return false; end if;
  update public.invites
     set status = p_status,
         confirmed_count = case
           when p_status = 'confirmed' then least(greatest(coalesce(p_count, party_size), 1), party_size)
           when p_status = 'declined' then 0
           else null end,
         responded_at = case when p_status = 'pending' then null else now() end,
         change_requested_at = case when p_status = 'pending' then now() else null end
   where token = p_token
     and (p_status <> 'pending' or checked_in_at is null);
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
