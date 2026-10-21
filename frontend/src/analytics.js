// PostHog is loaded AFTER the app has painted, not as part of the first
// download (posthog-js is ~28% of the old main bundle). Anything captured
// before it is ready - the very first page_view, a login, an early API
// error - is queued and replayed in order the moment it loads, so nothing is
// lost. If PostHog is not configured (no key/host) every call is a no-op.

const POSTHOG_KEY = process.env.REACT_APP_POSTHOG_KEY;
const POSTHOG_HOST = process.env.REACT_APP_POSTHOG_HOST;
const enabled = Boolean(POSTHOG_KEY && POSTHOG_HOST);

let client = null; // the posthog instance once loaded
let loading = null;
const queue = []; // functions waiting for the client
const MAX_QUEUE = 200;

const run = (fn) => {
  if (!enabled) return;
  if (client) {
    try {
      fn(client);
    } catch (_) {
      // analytics must never break the app
    }
    return;
  }
  if (queue.length < MAX_QUEUE) queue.push(fn);
};

const load = () => {
  if (!enabled || loading) return loading;
  loading = import("posthog-js")
    .then((mod) => {
      const posthog = mod.default;
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        defaults: "2026-05-30",
        capture_pageview: false, // page_view is sent by hand with richer data
        capture_pageleave: true,
        autocapture: true, // clicks / inputs on every page, no per-page code
        capture_exceptions: true, // uncaught errors + unhandled rejections
      });
      client = posthog;
      queue.splice(0).forEach((fn) => {
        try {
          fn(posthog);
        } catch (_) {}
      });
    })
    .catch(() => {
      loading = null; // blocked by an ad-blocker / offline: stay a no-op
      queue.length = 0;
    });
  return loading;
};

// Called once at start-up. Waits until the browser is idle after the page has
// loaded so PostHog's download and set-up never compete with first paint.
export const initAnalytics = () => {
  if (!enabled || typeof window === "undefined") return;

  const start = () => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(load, { timeout: 3000 });
    } else {
      setTimeout(load, 1500);
    }
  };

  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
};

export const trackEvent = (eventName, properties = {}) => {
  run((posthog) => posthog.capture(eventName, properties));
};

// Properties attached to EVERY later event, including autocaptured clicks,
// so each one can be filtered by page and role without per-page code.
export const setAnalyticsContext = (properties) => {
  run((posthog) => posthog.register(properties));
};

export const identifyUser = (user) => {
  if (!user?.id) return;

  // distinct_id is already the app's own unique user.id, not the email —
  // each PMT login already has its own separate PostHog Person. The issue
  // is purely cosmetic: PostHog's "Person display name" preference (a
  // project setting) defaults to showing a person's `email` property when
  // present, and PMT's email field has no uniqueness constraint, so
  // several distinct accounts sharing one team inbox address all render
  // under that same label. Sending `username` (which IS enforced unique
  // at signup/edit — see create_user/update_user in server.py) gives that
  // display-name preference something distinguishing to prefer instead.
  run((posthog) =>
    posthog.identify(String(user.id), {
      name: user.name,
      email: user.email,
      username: user.username,
      role: user.role,
      department: user.department,
    }),
  );
  setAnalyticsContext({ role: user.role, department: user.department });
};

export const resetAnalytics = () => {
  run((posthog) => posthog.reset());
};
