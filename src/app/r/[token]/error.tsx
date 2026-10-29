'use client';

/** If the invite page fails on the server, show something kind and a way to retry (with the error code so it can be traced). */
export default function InviteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="site rsvp-wrap">
      <main className="rsvp-card" style={{ alignItems: 'center' }}>
        <h1 className="rc-title" style={{ fontSize: '1.5em' }}>
          تعذّر فتح الدعوة · Couldn’t open the invitation
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          جرّبوا مرة ثانية بعد لحظات · Please try again in a moment
        </p>
        <button className="btn primary" onClick={() => reset()}>
          إعادة المحاولة · Try again
        </button>
        {error.digest && (
          <p className="muted" dir="ltr" style={{ margin: 0, fontSize: '.8em' }}>
            code: {error.digest}
          </p>
        )}
      </main>
    </div>
  );
}
