// SitRep Service Worker — v1: app shell cache only.
// No background sync or push notifications in v1.

const CACHE = "sitrep-shell-v1";

const SHELL = [
  "/",
  "/list",
  "/calendar",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
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

  // Cache-first for shell assets
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok && request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      }).catch(() => caches.match("/list") ?? new Response("Offline", { status: 503 }));
    })
  );
});
