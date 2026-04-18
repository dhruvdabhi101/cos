// Chief of Staff — minimal service worker.
// Strategy: network-first for pages, cache-first for static assets.
// Invariant: every respondWith() resolves to a real Response — never undefined.
const VERSION = "cos-v2";
const APP_SHELL = ["/", "/login", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function offlineFallback() {
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Offline</title><p>Offline.",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept API or auth — always hit the network directly.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Skip cross-origin; let the browser handle them natively.
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        } catch {
          const cached = (await caches.match(req)) || (await caches.match("/"));
          return cached ?? offlineFallback();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      } catch {
        return cached ?? Response.error();
      }
    })()
  );
});
