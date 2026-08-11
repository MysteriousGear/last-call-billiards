/* Last Call Billiards — service worker.
   App shell is precached so the game runs offline once installed. The Google
   font is cached opportunistically at runtime (it's cross-origin/opaque, so
   it can't be precached reliably — the CSS falls back to monospace anyway). */
// Bump on every deploy: the fetch handler is cache-first for scripts, so a
// stale cache would keep serving the previous build to returning players.
var VERSION = "lcb-v7";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./src/geometry.js",
  "./src/physics.js",
  "./src/render.js",
  "./src/game.js",
  "./icons/icon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION)
      .then(function (c) { return c.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === VERSION ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  // Navigations: network first so a fresh deploy is picked up, cache as backup.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put("./index.html", copy); });
        return res;
      }).catch(function () {
        return caches.match("./index.html").then(function (m) {
          return m || caches.match("./");
        });
      })
    );
    return;
  }

  // Everything else: cache first, then network (and remember what we fetch).
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && (res.ok || res.type === "opaque")) {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
    })
  );
});
