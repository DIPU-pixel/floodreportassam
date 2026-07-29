/* Assam Flood Watch service worker — push notifications only.
 * Deliberately minimal: no offline caching of live data (people must never see
 * a stale "all clear" during a flood). It exists to receive push alerts and to
 * focus/open the app when one is tapped. */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

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
