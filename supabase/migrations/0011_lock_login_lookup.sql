-- Visitors could call login_email directly and read a planner's email from a username.
-- From now on only the server (with the service key) may call it.
-- Run this AFTER SUPABASE_SERVICE_ROLE_KEY is set in the hosting environment and the app is redeployed,
-- otherwise signing in with a username stops working.
revoke execute on function public.login_email(text) from public, anon, authenticated;
grant execute on function public.login_email(text) to service_role;
