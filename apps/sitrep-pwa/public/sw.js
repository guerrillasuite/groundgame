// SitRep Service Worker — v2: network-first for navigations, cache-first for static assets.

const CACHE = "sitrep-shell-v2";

const STATIC_ASSETS = [
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(STATIC_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Network-first for API routes and auth
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/login")) {
    e.respondWith(fetch(request).catch(() => new Response("Offline", { status: 503 })));
    return;
  }

  // Network-first for HTML navigation requests — ensures fresh JS chunks after deploy
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() =>
        caches.match(request).then((cached) => cached ?? new Response("Offline", { status: 503 }))
      )
    );
    return;
  }

  // Cache-first for static assets (icons, manifest, fonts, Next.js immutable chunks)
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok && request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      }).catch(() => new Response("Offline", { status: 503 }));
    })
  );
});
