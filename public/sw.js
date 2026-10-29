// Needed so browsers offer to install the app. It deliberately caches nothing:
// every page and request goes to the network, so login state and live data are never stale.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
