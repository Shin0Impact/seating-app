'use client';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { useS } from './LangProvider';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

/**
 * "Install app" row for the settings menu. Browsers that can install the app hand us a prompt
 * (Chrome, Edge, Brave and others on Android); iPhones have no prompt, so we explain Share > Add to Home Screen.
 * Shown nowhere once the app is already installed.
 */
export default function InstallApp() {
  const s = useS();
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [mode, setMode] = useState<'hidden' | 'prompt' | 'ios'>('hidden');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (isIos()) setMode('ios');
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setMode('prompt');
    };
    const onInstalled = () => setDone(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (done || mode === 'hidden') return null;
  return (
    <section className="set-sec">
      <h3>{s('installApp')}</h3>
      {mode === 'prompt' && event ? (
        <button
          className="primary"
          onClick={async () => {
            await event.prompt();
            const { outcome } = await event.userChoice;
            if (outcome === 'accepted') setDone(true);
            setEvent(null);
            setMode('hidden');
          }}
        >
          <Icon name="download" size={18} />
          {s('installButton')}
        </button>
      ) : (
        <small className="muted">{s('installIos')}</small>
      )}
      {mode === 'prompt' && <small className="muted">{s('installHint')}</small>}
    </section>
  );
}
