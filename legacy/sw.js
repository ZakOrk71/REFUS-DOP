/* Service worker minimal : met en cache la coquille de l'app pour
   un démarrage rapide. Les cartes et données restent en réseau. */
const CACHE = 'refus-dop-v1';
const SHELL = ['./', './index.html', './style.css', './app.js', './manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // On ne met en cache que la coquille locale ; le reste passe en réseau.
  if (url.origin === location.origin && SHELL.some(s => url.pathname.endsWith(s.replace('./', '/')) || url.pathname.endsWith('/'))) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
