/* Clevertree Chat PWA service worker */
const SHELL_CACHE = "clevertree-shell-v3";
const SHELL_URLS = [
  "/",
  "/chat/",
  "/chat/flock-cameras",
  "/try/",
  "/w/",
  "/offline.html",
  "/site.webmanifest",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/fronts/snippet/clevertree-board.css",
  "/fronts/snippet/clevertree-board.js",
  "/fronts/snippet/clevertree-outbox.js",
  "/fronts/room/clevertree-room.js",
  "/fronts/room/clevertree-room.css",
  "/js/site-theme.js",
  "/js/site-nav.js",
  "/js/site-pwa.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("clevertree-") && k !== SHELL_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          void caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          return (
            (await caches.match(req)) ||
            (await caches.match("/chat/")) ||
            (await caches.match("/try/")) ||
            (await caches.match("/offline.html")) ||
            Response.error()
          );
        }),
    );
    return;
  }

  // Room UI ships often (nick/identity); always prefer network then refresh cache.
  if (url.pathname.startsWith("/fronts/room/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "outbox-flush") return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "outbox-flush" }),
        );
      },
    ),
  );
});
