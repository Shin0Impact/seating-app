// Makes the app installable, and lets the door helpers' page open with no signal.
// Only two things are kept: the build's own files (their names change with every release, so they never go stale)
// and the helper page itself (/h/...), which is always fetched fresh when there is a connection. Everything else,
// including the planner's pages and all live data, always goes to the network.
const CACHE = 'desk-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  ),
);

const soon = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('slow')), ms))]);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === 'navigate' && url.pathname.startsWith('/h/')) {
    e.respondWith(
      (async () => {
        const c = await caches.open(CACHE);
        try {
          const res = await soon(fetch(req), 5000);
          if (res.ok) c.put(req, res.clone());
          return res;
        } catch (err) {
          const hit = await c.match(req);
          if (hit) return hit;
          throw err;
        }
      })(),
    );
  }
});
