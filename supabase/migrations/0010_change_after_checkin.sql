-- A family can change its answer at any time, even after being scanned at the door (the app asks "are you sure?" first).
-- The door record (checked_in_at) is kept as it is.
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
   where token = p_token;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;
