/* FUNAAB BetSim SW — installability + network-first shell (avoid stale UI after deploys) */
const CACHE = "funaab-betsim-v4";
const PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        Promise.all(
          PRECACHE.map((u) =>
            c.add(u).catch(() => {
              /* ignore missing */
            })
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API — always network
  if (url.pathname.startsWith("/api/")) return;

  // HTML / Next navigations / RSC: network-first so deploys show up immediately
  const accept = req.headers.get("accept") || "";
  const isDocument =
    req.mode === "navigate" ||
    accept.includes("text/html") ||
    accept.includes("text/x-component") ||
    accept.includes("application/rsc");

  if (isDocument) {
    event.respondWith(
      fetch(req)
        .then((res) => res)
        .catch(() => caches.match(req))
    );
    return;
  }

  // Static assets: stale-while-revalidate (hashed Next chunks get new URLs on deploy)
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (
            res.ok &&
            url.pathname.match(/\.(js|css|png|svg|webmanifest|woff2?|ico)$/)
          ) {
            void cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
