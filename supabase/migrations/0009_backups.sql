-- Daily backups of every event (hall plan + invitations), plus a last snapshot whenever an event is deleted.
-- Run once in the Supabase SQL editor. Then restore from the app: Events page > Backups.

create table if not exists public.event_backups (
  id        uuid primary key default gen_random_uuid(),
  event_id  uuid not null,
  owner_id  uuid not null,
  name      text not null,
  reason    text not null default 'daily' check (reason in ('daily', 'deleted')),
  event     jsonb not null,   -- the whole events row
  invites   jsonb not null default '[]',
  taken_at  timestamptz not null default now()
);
create index if not exists event_backups_owner_idx on public.event_backups (owner_id, taken_at desc);
alter table public.event_backups enable row level security;
drop policy if exists backups_owner_read on public.event_backups;
create policy backups_owner_read on public.event_backups for select to authenticated using (owner_id = auth.uid());
-- no insert/update/delete policies: only the functions below write here

-- One snapshot per event per day (skipped when nothing changed since the last one); keeps 30 days.
create or replace function public.take_backups() returns integer
language plpgsql security definer set search_path = public as $fn$
declare n integer := 0; e record; last_layout jsonb;
begin
  for e in select * from public.events loop
    select (b.event ->> 'layout')::jsonb into last_layout from public.event_backups b where b.event_id = e.id order by b.taken_at desc limit 1;
    if last_layout is distinct from e.layout or not exists (select 1 from public.event_backups b where b.event_id = e.id and b.taken_at > now() - interval '7 days') then
      insert into public.event_backups (event_id, owner_id, name, event, invites)
      values (e.id, e.owner_id, e.name, to_jsonb(e), coalesce((select jsonb_agg(to_jsonb(i)) from public.invites i where i.event_id = e.id), '[]'));
      n := n + 1;
    end if;
  end loop;
  delete from public.event_backups where taken_at < now() - interval '30 days' and reason = 'daily';
  return n;
end $fn$;
revoke all on function public.take_backups() from public, anon, authenticated;

-- Deleting an event (even by accident) first saves a snapshot that is kept for 90 days.
create or replace function public.backup_on_delete() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  insert into public.event_backups (event_id, owner_id, name, reason, event, invites)
  values (old.id, old.owner_id, old.name, 'deleted', to_jsonb(old), coalesce((select jsonb_agg(to_jsonb(i)) from public.invites i where i.event_id = old.id), '[]'));
  delete from public.event_backups where reason = 'deleted' and taken_at < now() - interval '90 days';
  return old;
end $fn$;
drop trigger if exists events_backup_on_delete on public.events;
create trigger events_backup_on_delete before delete on public.events for each row execute function public.backup_on_delete();

-- Restore: puts the event back (re-created if it was deleted, otherwise its plan is rolled back). Invitation links come back too.
create or replace function public.restore_backup(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $fn$
declare b record; cur record;
begin
  select * into b from public.event_backups where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'not found'; end if;
  select * into cur from public.events where id = b.event_id;
  if found then
    if cur.owner_id <> auth.uid() then raise exception 'not yours'; end if;
    insert into public.event_backups (event_id, owner_id, name, event, invites, reason)
      values (cur.id, cur.owner_id, cur.name, to_jsonb(cur), coalesce((select jsonb_agg(to_jsonb(i)) from public.invites i where i.event_id = cur.id), '[]'), 'deleted');
    update public.events set layout = (b.event ->> 'layout')::jsonb, name = b.event ->> 'name', version = cur.version + 1, updated_at = now() where id = cur.id;
  else
    insert into public.events select * from jsonb_populate_record(null::public.events, b.event);
  end if;
  insert into public.invites select * from jsonb_populate_recordset(null::public.invites, b.invites) on conflict do nothing;
  return b.event_id;
end $fn$;
revoke all on function public.restore_backup(uuid) from public, anon;
grant execute on function public.restore_backup(uuid) to authenticated;

-- Daily at 01:00 UTC (needs the pg_cron extension: Dashboard > Database > Extensions > pg_cron > enable, then run this file again).
do $do$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule('daily-event-backups') where exists (select 1 from cron.job where jobname = 'daily-event-backups');
  perform cron.schedule('daily-event-backups', '0 1 * * *', 'select public.take_backups()');
exception when others then
  raise notice 'pg_cron is not enabled yet: enable it in Database > Extensions, then run this file again. (%)', sqlerrm;
end $do$;

select public.take_backups() as first_backups;
