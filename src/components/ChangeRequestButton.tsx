'use client';
import { useRef } from 'react';
import { useS } from './LangProvider';
import SubmitButton from './SubmitButton';

/**
 * "We want to change our answer": opens a popup that says the invitation was already answered and asks
 * whether to change it. Built on <details> so it opens even before the page's scripts have loaded (slow
 * connections); the confirm button is a real submit button that shows a spinner while it works.
 */
export default function ChangeRequestButton({
  action,
  token,
}: {
  action: (form: FormData) => void | Promise<void>;
  token: string;
}) {
  const s = useS();
  const box = useRef<HTMLDetailsElement>(null);
  return (
    <details className="change-details" ref={box}>
      <summary className="linkbtn">{s('wantChange')}</summary>
      <form action={action} className="change-pop" role="alertdialog" aria-label={s('changeAsk')}>
        <input type="hidden" name="token" value={token} />
        <p>{s('changeAsk')}</p>
        <div className="row">
          <SubmitButton name="status" value="pending" className="btn primary">
            {s('changeYes')}
          </SubmitButton>
          <button type="button" className="btn" onClick={() => box.current?.removeAttribute('open')}>
            {s('changeNo')}
          </button>
        </div>
      </form>
    </details>
  );
}
