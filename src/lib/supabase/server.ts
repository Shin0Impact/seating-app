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
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { label: '', username: null };
  const { data: p } = await supabase.from('profiles').select('username').eq('user_id', u.user.id).maybeSingle();
  return { label: p?.username ?? u.user.email ?? '', username: p?.username ?? null };
}
