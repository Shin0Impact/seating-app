import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './env';

/**
 * A server-only client with the secret service key, used for the few lookups no visitor may run themselves
 * (finding the email for a username). It is never sent to the browser. Null until SUPABASE_SERVICE_ROLE_KEY is set.
 */
export function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !key) return null;
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
