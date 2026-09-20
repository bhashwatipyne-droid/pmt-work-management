import { initializeApp, getApp, getApps } from "firebase/app";
import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from "firebase/messaging";

// Public web-app identifiers for the pmt-finace Firebase project (Firebase
// console > Project settings > General > Your apps > Web app). They are not
// secrets. The REACT_APP_FIREBASE_* env vars, when set, override these
// defaults, so another environment can point at a different project.
const firebaseConfig = {
  apiKey:
    process.env.REACT_APP_FIREBASE_API_KEY ||
    "AIzaSyAmlEXUcgI2bHuedeuDoPwK_SEbuSuct2o",
  authDomain:
    process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "pmt-finace.firebaseapp.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "pmt-finace",
  storageBucket:
    process.env.REACT_APP_FIREBASE_STORAGE_BUCKET ||
    "pmt-finace.firebasestorage.app",
  messagingSenderId:
    process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "836985701027",
  appId:
    process.env.REACT_APP_FIREBASE_APP_ID ||
    "1:836985701027:web:f5fc022ee9b7fcbc0ab516",
};

// Firebase console > Project settings > Cloud Messaging > Web Push
// certificates > Key pair (the PUBLIC key; never put the service-account
// private key in the frontend).
const VAPID_KEY =
  process.env.REACT_APP_FIREBASE_VAPID_KEY ||
  "BFdgf4esXIB1Fn49Kx8_H_acU5e7wcQls4cpmPNoi2Fep9LqUARpe_LViyEDb5gOtfUJrLH_-BmT0jpvVnLVnu4";

export const isFirebaseConfigured = () =>
  Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.projectId &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId &&
      VAPID_KEY,
  );

const getFirebaseApp = () =>
  getApps().length ? getApp() : initializeApp(firebaseConfig);

// True only when this browser can do web push AND Firebase env vars are set.
// Safari < 16.4, in-app browsers and non-HTTPS origins return false.
export const isPushSupported = async () => {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator) ||
    !isFirebaseConfigured()
  ) {
    return false;
  }

  try {
    return await isSupported();
  } catch (_) {
    return false;
  }
};

// A service worker cannot read process.env, so the (public) web config is
// handed to it through the script URL's query string.
const serviceWorkerUrl = () => {
  const params = new URLSearchParams();

  Object.entries(firebaseConfig).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  return `${process.env.PUBLIC_URL || ""}/firebase-messaging-sw.js?${params.toString()}`;
};

// Returns this browser's FCM registration token, or null if push is
// unsupported / not permitted. Notification permission must already be
// "granted" before calling this.
export const getPushToken = async () => {
  if (!(await isPushSupported())) return null;
  if (Notification.permission !== "granted") return null;

  const registration = await navigator.serviceWorker.register(
    serviceWorkerUrl(),
    { scope: `${process.env.PUBLIC_URL || ""}/` },
  );
  await navigator.serviceWorker.ready;

  return getToken(getMessaging(getFirebaseApp()), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
};

// Calls handler({ notification_id, title?, body?, link? }) the moment a push
// reaches this browser,
// so the page can react instantly instead of waiting for its next poll.
// Covers both delivery paths: page visible (Firebase onMessage) and page
// hidden (firebase-messaging-sw.js forwards it with postMessage).
// Returns a cleanup function.
export const listenForPush = (handler) => {
  const cleanups = [];
  let cancelled = false;

  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const onWorkerMessage = (event) => {
      if (event.data && event.data.type === "pmt-push") {
        handler({ notification_id: event.data.notification_id || "" });
      }
    };

    navigator.serviceWorker.addEventListener("message", onWorkerMessage);
    cleanups.push(() =>
      navigator.serviceWorker.removeEventListener("message", onWorkerMessage),
    );
  }

  isPushSupported()
    .then((supported) => {
      if (!supported || cancelled) return;

      const unsubscribe = onMessage(getMessaging(getFirebaseApp()), (payload) =>
        handler({
          notification_id: (payload.data && payload.data.notification_id) || "",
          title: payload.data && payload.data.title,
          body: payload.data && payload.data.body,
          link: payload.data && payload.data.link,
        }),
      );

      if (cancelled) unsubscribe();
      else cleanups.push(unsubscribe);
    })
    .catch(() => {});

  return () => {
    cancelled = true;
    cleanups.forEach((cleanup) => cleanup());
  };
};

export const NOTIFICATION_ICON = "/pmt-notification-icon.png";

// Shows the operating-system popup (the Slack-style corner notification) from
// the page itself. Used when PMT is visible but another window has focus,
// because in that case Firebase hands the push to the page and the service
// worker never gets to show one. Clicks are handled by the service worker.
export const showSystemNotification = async ({
  title,
  body,
  link,
  notification_id: notificationId,
}) => {
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    Notification.permission !== "granted" ||
    !("serviceWorker" in navigator)
  ) {
    return;
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;

  await registration.showNotification(title || "TheFinpedia PMT", {
    body: body || "",
    icon: NOTIFICATION_ICON,
    tag: notificationId || undefined,
    data: { link: link || "/" },
  });
};