export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
// Supabase now calls the public key "publishable"; the older name was "anon". Either variable works.
export const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
/** False until the URL and the public key are set; the offline editor at "/" keeps working without them. */
export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey);
