/* Assam Flood Watch — offline-capable service worker.
 *
 * Strategy:
 *   SHELL (app HTML/JS/CSS)     — cache on install, network-first on navigate
 *   BUNDLED DATA (geojson/json) — cache on install (rarely changes)
 *   MAP TILES                   — cache-as-you-go (stale-while-revalidate)
 *   API DATA (/api/rain, /flood)— network-first, fall back to last cached
 *   PUSH                        — pass through (existing behaviour)
 *
 * The map must NEVER go blank — if we're offline, show cached tiles + last
 * known risk data. An OFFLINE badge in the app tells the user.
 */

const CACHE_VERSION = "afw-v3";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;
const TILE_CACHE = `tiles-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;

const MAX_TILE_ENTRIES = 2000;

const SHELL_URLS = ["/"];

const BUNDLED_DATA = [
  "/data/assam_districts.geojson",
  "/data/rivers.geojson",
  "/data/towns.json",
  "/data/gauges.json",
  "/icon.svg",
  "/manifest.webmanifest",
];

const CACHED_API_ROUTES = ["/api/rain", "/api/flood", "/api/help"];

const TILE_HOSTS = [
  "tile.openstreetmap.org",
  "server.arcgisonline.com",
  "services.arcgisonline.com",
  "mt0.google.com",
  "mt1.google.com",
  "mt2.google.com",
  "mt3.google.com",
];

// ---------------------------------------------------------------------------
// Install — pre-cache shell + bundled data
// ---------------------------------------------------------------------------
self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)),
      caches.open(DATA_CACHE).then((c) => c.addAll(BUNDLED_DATA)),
    ]).then(() => self.skipWaiting())
  );
});

// ---------------------------------------------------------------------------
// Activate — clean old caches
// ---------------------------------------------------------------------------
self.addEventListener("activate", (event) => {
  const keep = new Set([SHELL_CACHE, DATA_CACHE, TILE_CACHE, API_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n)))
      )
      .then(() => self.clients.claim())
  );
});

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests (form posts, etc.)
  if (event.request.method !== "GET") return;

  // 1) Map tiles — stale-while-revalidate
  if (TILE_HOSTS.some((h) => url.hostname.includes(h))) {
    event.respondWith(tileStrategy(event.request));
    return;
  }

  // 2) Bundled data files — cache-first (immutable between deploys)
  if (BUNDLED_DATA.some((p) => url.pathname === p)) {
    event.respondWith(cacheFirst(event.request, DATA_CACHE));
    return;
  }

  // 3) API routes we want to cache — network-first, cached fallback
  if (CACHED_API_ROUTES.some((r) => url.pathname.startsWith(r))) {
    event.respondWith(networkFirstApi(event.request));
    return;
  }

  // 4) Navigation (HTML pages) — network-first, fall back to cached shell
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstShell(event.request));
    return;
  }

  // 5) App assets (JS/CSS chunks) — stale-while-revalidate
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/") || url.pathname.endsWith(".js") || url.pathname.endsWith(".css"))
  ) {
    event.respondWith(staleWhileRevalidate(event.request, SHELL_CACHE));
    return;
  }
});

// ---------------------------------------------------------------------------
// Strategies
// ---------------------------------------------------------------------------

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match("/");
    return cached || new Response("Offline — cached page not available", {
      status: 503,
      headers: { "Content-Type": "text/html" },
    });
  }
}

async function networkFirstApi(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set("X-AFW-Offline", "true");
      return new Response(cached.body, {
        status: cached.status,
        statusText: cached.statusText,
        headers,
      });
    }
    return new Response(JSON.stringify({ error: "offline", offline: true }), {
      status: 503,
      headers: { "Content-Type": "application/json", "X-AFW-Offline": "true" },
    });
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function tileStrategy(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
        trimCache(TILE_CACHE, MAX_TILE_ENTRIES);
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    fetchPromise.catch(() => {});
    return cached;
  }

  const networkResponse = await fetchPromise;
  if (networkResponse) return networkResponse;

  return new Response("", { status: 408, statusText: "Offline — tile not cached" });
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    const excess = keys.length - maxEntries;
    for (let i = 0; i < excess; i++) {
      await cache.delete(keys[i]);
    }
  }
}

// ---------------------------------------------------------------------------
// Push notifications (existing behaviour)
// ---------------------------------------------------------------------------
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "Assam Flood Watch", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Assam Flood Watch";
  const options = {
    body: data.body || "",
    tag: data.tag || "afw-alert",
    icon: "/icon.svg",
    badge: "/icon.svg",
    lang: data.lang === "as" ? "as" : "en",
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
