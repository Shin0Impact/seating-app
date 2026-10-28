-- A confirmed family can ask to bring more people than it was invited with. The planner sees the number and decides.
alter table public.invites add column if not exists extra_requested integer not null default 0 check (extra_requested between 0 and 20);

create or replace function public.rsvp_request_more(p_token text, p_extra integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  if p_extra is null or p_extra < 1 then return false; end if;
  update public.invites
     set extra_requested = least(p_extra, 20)
   where token = p_token and status = 'confirmed';
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

revoke all on function public.rsvp_request_more(text, integer) from public;
grant execute on function public.rsvp_request_more(text, integer) to anon, authenticated;
