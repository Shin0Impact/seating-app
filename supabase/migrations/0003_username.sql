-- Usernames: a planner can pick a username and then sign in with it instead of the email.
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  username   text not null unique check (username = lower(username) and username !~ '[@\s]' and char_length(username) between 2 and 30),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_owner on public.profiles
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The login page is anonymous, so it asks this function which email belongs to a username.
-- It returns only the email for that exact username, nothing else.
create or replace function public.login_email(p_username text)
returns text
language sql
security definer
set search_path = public, auth
as $$
  select u.email::text
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.username = lower(trim(p_username))
  limit 1;
$$;

revoke all on function public.login_email(text) from public;
grant execute on function public.login_email(text) to anon, authenticated;
