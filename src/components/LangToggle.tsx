'use client';
import { useLang } from './LangProvider';

/** One-tap language switch for pages with no header (landing, invitations). */
export default function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <button
      className="btn small"
      onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
      lang={lang === 'ar' ? 'en' : 'ar'}
    >
      {lang === 'ar' ? 'English' : 'العربية'}
    </button>
  );
}
