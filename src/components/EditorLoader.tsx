'use client';

import dynamic from 'next/dynamic';

// The canvas only works in the browser, so it is never rendered on the server.
const Editor = dynamic(() => import('./Editor'), {
  ssr: false,
  loading: () => <p style={{ padding: 24 }}>…</p>,
});

export default function EditorLoader() {
  return <Editor />;
}
