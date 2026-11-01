// Service worker: lets the app open and work with no internet.
// Bump VERSION whenever you change the list of files below.
const VERSION = "ht-v1";
const SHELL = ["./", "index.html", "style.css", "script.js", "config.js", "manifest.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const keep = (res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; };

  if (url.origin === location.origin) {
    // Online: always get the newest files. Offline: fall back to the saved copy.
    e.respondWith(fetch(req).then(keep).catch(() =>
      caches.match(req, { ignoreSearch: true }).then((m) => m || caches.match("index.html"))));
  } else if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(req).then((m) => m || fetch(req).then(keep)));
  }
});
