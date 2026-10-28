import { cookies } from 'next/headers';
import type { Lang } from './i18n';
import { makeS } from './site-i18n';

export const LANG_COOKIE = 'seating-lang';

/** The visitor's language from the cookie; Arabic until they pick one. */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return v === 'en' ? 'en' : 'ar';
}

export async function getS() {
  const lang = await getLang();
  return { lang, s: makeS(lang) };
}
