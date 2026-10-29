-- A confirmed family can see where its table is (shapes and its own seats only, never other guests' names).
-- This restores the original rule in case an earlier version of this file was run: no scan needed.
create or replace function public.rsvp_map(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  inv public.invites;
  ev public.events;
begin
  select * into inv from public.invites where token = p_token;
  if not found or inv.status <> 'confirmed' then return null; end if;
  select * into ev from public.events where id = inv.event_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'settings', ev.layout -> 'settings',
    'elements', coalesce(ev.layout -> 'elements', '[]'::jsonb),
    'placements', coalesce((
      select jsonb_agg(jsonb_build_object('id', g ->> 'id', 'tableId', g ->> 'tableId', 'seat', g -> 'seat'))
      from jsonb_array_elements(coalesce(ev.layout -> 'guests', '[]'::jsonb)) g
      where (g ->> 'id') = inv.guest_id::text or (g ->> 'id') = any (select m::text from unnest(inv.member_ids) m)
    ), '[]'::jsonb)
  );
end;
$fn$;
