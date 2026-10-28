import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseKey, supabaseUrl } from './env';

/** A Supabase client that acts as the logged-in planner (row-level security applies) or as anonymous. */
export async function serverClient() {
  const jar = await cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {
          /* called from a Server Component: the proxy refreshes the session instead */
        }
      },
    },
  });
}

/** The signed-in planner's username if they picked one, otherwise their email. */
export async function whoAmI(supabase: Awaited<ReturnType<typeof serverClient>>): Promise<{ label: string; username: string | null }> {
  // getClaims checks the signed token locally, so it costs no round trip to Supabase.
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return { label: '', username: null };
  const { data: p } = await supabase.from('profiles').select('username').eq('user_id', c.sub).maybeSingle();
  const email = typeof c.email === 'string' ? c.email : '';
  return { label: p?.username ?? email, username: p?.username ?? null };
}
