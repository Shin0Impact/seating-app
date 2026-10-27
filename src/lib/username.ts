/** Planners sign in with an email or with a username they picked (stored in public.profiles). */
export const USERNAME_RE = /^[^@\s]{2,30}$/;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(input: string): boolean {
  return USERNAME_RE.test(normalizeUsername(input));
}
