'use client';
import { useFormStatus } from 'react-dom';

/** A submit button that shows it is working, so a slow connection never looks like a dead tap. */
export default function SubmitButton({
  children,
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      name={name}
      value={value}
      className={`${className ?? ''}${pending ? ' is-busy' : ''}`}
      aria-busy={pending}
      onClick={(e) => {
        if (pending) e.preventDefault();
      }}
    >
      {children}
      {pending && <span className="spin" aria-hidden />}
    </button>
  );
}
