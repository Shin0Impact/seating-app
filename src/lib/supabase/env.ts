export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
/** False until the two NEXT_PUBLIC_SUPABASE_* variables are set; the offline editor at "/" keeps working without them. */
export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);
