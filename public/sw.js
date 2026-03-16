// GroundGame Service Worker
// Strategy:
//   - _next/static/* → cache-first (hashed assets, immutable)
//   - /api/doors/*   → network-first, fall back to cache
//   - everything else → network-only pass-through

const STATIC_CACHE = "gg-static-v1";
const DOORS_CACHE = "gg-doors-v1";
const STOP_QUEUE_STORE = "gg-stop-queue";

// ── Install: skip waiting so new SW activates immediately ──────────────────
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

// ── Activate: claim clients, clean up old caches ──────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE && k !== DOORS_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch handler ──────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Static Next.js assets — cache-first
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Doors API — network-first with cache fallback (GET only)
  if (url.pathname.startsWith("/api/doors/") && request.method === "GET") {
    event.respondWith(networkFirstWithCache(request, DOORS_CACHE));
    return;
  }

  // POST to /api/doors/stops — try network, queue on failure
  if (url.pathname === "/api/doors/stops" && request.method === "POST") {
    event.respondWith(stopWithOfflineQueue(request));
    return;
  }

  // Everything else — network only
});

// ── Background Sync: flush queued stops when back online ──────────────────
self.addEventListener("sync", (event) => {
  if (event.tag === "flush-stops") {
    event.waitUntil(flushQueuedStops());
  }
});

// ── Cache strategies ───────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

async function networkFirstWithCache(request, cacheName) {
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: "offline", cached: false }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// Try to POST the stop; if offline, queue in IndexedDB and return a synthetic ok
async function stopWithOfflineQueue(request) {
  try {
    const res = await fetch(request.clone());
    return res;
  } catch {
    // Offline — queue the body in IndexedDB
    try {
      const body = await request.json();
      await queueStop(body);
    } catch {}
    return new Response(
      JSON.stringify({ ok: true, queued: true, stop_id: null }),
      { status: 202, headers: { "Content-Type": "application/json" } }
    );
  }
}

// ── IndexedDB helpers for the stop queue ──────────────────────────────────

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("gg-offline", 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STOP_QUEUE_STORE, {
        keyPath: "id",
        autoIncrement: true,
      });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueStop(body) {
  const db = await openQueueDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STOP_QUEUE_STORE, "readwrite");
    tx.objectStore(STOP_QUEUE_STORE).add({ ...body, queued_at: Date.now() });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function flushQueuedStops() {
  const db = await openQueueDb();
  const stops = await new Promise((resolve, reject) => {
    const tx = db.transaction(STOP_QUEUE_STORE, "readonly");
    const req = tx.objectStore(STOP_QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const stop of stops) {
    try {
      const res = await fetch("/api/doors/stops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stop),
      });
      if (res.ok) {
        // Remove from queue
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STOP_QUEUE_STORE, "readwrite");
          tx.objectStore(STOP_QUEUE_STORE).delete(stop.id);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        });
      }
    } catch {
      // Still offline — leave in queue
    }
  }
}
