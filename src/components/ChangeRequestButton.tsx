'use client';
import { useEffect, useRef, useState } from 'react';
import { useS } from './LangProvider';

/** Asks twice before sending the family back to "unanswered", so a stray tap can't undo their reply. */
export default function ChangeRequestButton({ action, token }: { action: (form: FormData) => void | Promise<void>; token: string }) {
  const s = useS();
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="status" value="pending" />
      <button
        type="button"
        className={armed ? 'btn' : 'linkbtn'}
        onClick={(e) => {
          if (armed) {
            e.currentTarget.form?.requestSubmit();
            return;
          }
          setArmed(true);
          timer.current = setTimeout(() => setArmed(false), 6000);
        }}
      >
        {armed ? s('tapAgain') : s('wantChange')}
      </button>
    </form>
  );
}
