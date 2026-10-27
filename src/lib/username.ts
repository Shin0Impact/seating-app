/** Planners can sign in with a plain username. Supabase signs in by email, so a username maps to a
 *  fixed fake address on this domain (create the user in Supabase with that email, "Auto confirm" on). */
export const USERNAME_DOMAIN = 'seating.example.com';

/** "maher" -> "maher@seating.example.com"; anything containing "@" is treated as a real email. */
export function toLoginEmail(input: string): string {
  const v = input.trim().toLowerCase();
  if (!v) return v;
  return v.includes('@') ? v : `${v}@${USERNAME_DOMAIN}`;
}

/** Friendly name for display: strips the fake domain from username accounts. */
export function displayName(email: string | null | undefined): string {
  if (!email) return '';
  return email.endsWith(`@${USERNAME_DOMAIN}`) ? email.slice(0, -(USERNAME_DOMAIN.length + 1)) : email;
}
