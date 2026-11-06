const PREFIX = "pose-engine-";
const CACHE = PREFIX + "v0.3.0";
const RUNTIME = PREFIX + "runtime-v0.3.0";
const RUNTIME_HOSTS = ["cdn.jsdelivr.net", "storage.googleapis.com"];
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/config.js",
  "./js/meta.js",
  "./js/library.js",
  "./js/app.js",
  "./engine/v2/index.js",
  "./engine/v2/landmarks.js",
  "./engine/v2/smoothing.js",
  "./engine/v2/features.js",
  "./engine/v2/grading.js",
  "./engine/v2/matcher.js",
  "./engine/v2/movements.js",
  "./engine/v2/capture.js",
  "./engine/v2/detector.js",
  "./engine/v2/camera.js",
  "./engine/v2/version.txt",
  "./manifest.json",
  "./assets/icon.svg",
  "./assets/icon-180.png",
  "./assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && key !== CACHE && key !== RUNTIME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (RUNTIME_HOSTS.indexOf(url.hostname) !== -1 && event.request.mode === "cors") {
    event.respondWith(
      caches.open(RUNTIME).then((cache) => cache.match(event.request).then((hit) => hit || fetch(event.request).then((response) => {
        if (response.ok) cache.put(event.request, response.clone()).catch(() => {});
        return response;
      }))),
    );
    return;
  }
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  if (!url.pathname.startsWith(scope.pathname)) return;
  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || (event.request.mode === "navigate" ? caches.match("./index.html") : Response.error()))),
  );
});
