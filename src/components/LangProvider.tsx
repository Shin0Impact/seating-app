'use client';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { dirOf, type Lang } from '@/lib/i18n';
import { makeS } from '@/lib/site-i18n';

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'ar', setLang: () => {} });

/** Holds the chosen language for the whole app. The choice lives in a cookie so server pages can render in it too. */
export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setL] = useState<Lang>(initial);
  const router = useRouter();
  const setLang = useCallback(
    (l: Lang) => {
      setL(l);
      try {
        document.cookie = `seating-lang=${l};path=/;max-age=31536000;samesite=lax`;
      } catch {
        /* ignore */
      }
      document.documentElement.lang = l;
      document.documentElement.dir = dirOf(l);
      router.refresh();
    },
    [router],
  );
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);

export function useS() {
  const { lang } = useLang();
  return useMemo(() => makeS(lang), [lang]);
}
