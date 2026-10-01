/* global self, caches, fetch, Response */
// Idara Pro service worker: makes the app installable and shows a clear page when offline.
// It caches nothing but that page: HR data and the app itself always come fresh from the server.
const SHELL = "idara-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(["/offline.html", "/icons/icon-192.png"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Page loads only: always the network; the offline page when there is none.
  if (req.mode !== "navigate") return;
  event.respondWith(fetch(req).catch(() => caches.match("/offline.html").then((r) => r || Response.error())));
});
