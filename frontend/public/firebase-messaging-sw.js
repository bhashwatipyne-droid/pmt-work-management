/* eslint-disable no-undef */

// Handle notification clicks. Registered before the Firebase SDK is loaded so
// it always runs for the notifications created below.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const link = (event.notification.data && event.notification.data.link) || "/";
  const url = new URL(link, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windowClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch (_) {}
          }
          return;
        }
      }

      await clients.openWindow(url);
    })(),
  );
});

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

importScripts(
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js",
);
importScripts(
  "https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js",
);

// The web app passes its (public) Firebase config in the query string of the
// URL it registers this worker with — see src/lib/firebase.js.
const params = new URL(self.location.href).searchParams;

firebase.initializeApp({
  apiKey: params.get("apiKey"),
  authDomain: params.get("authDomain"),
  projectId: params.get("projectId"),
  storageBucket: params.get("storageBucket"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});

const messaging = firebase.messaging();

// The backend sends data-only messages, so this is the single place a
// notification is displayed. It only runs while no PMT tab is visible; when a
// tab is open, the in-app NotificationCenter already shows the alert.
messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};

  self.registration.showNotification(data.title || "TheFinpedia PMT", {
    body: data.body || "",
    tag: data.notification_id || undefined,
    data: { link: data.link || "/" },
  });
});