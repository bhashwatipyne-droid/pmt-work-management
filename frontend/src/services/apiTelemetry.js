import axios from "axios";
import { trackEvent } from "@/analytics";

// One place that reports on EVERY API call the app makes, so no page needs
// its own tracking code to be covered:
//   api_mutation - a create/update/delete that succeeded (what people DO)
//   api_error    - any failed call (what is breaking for them)
//   api_slow     - a call that took too long (what is slow for them)
// Only the method, the route pattern (ids replaced by ":id"), the status and
// the duration are sent - never request or response bodies.

const SLOW_MS = 2000;
const SLOW_REPEAT_MS = 60000; // at most one api_slow per route per minute
const lastSlow = new Map();

const NOISY = [/^\/notifications/, /^\/auth\/me$/];

const routeOf = (url = "") => {
  let path = String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  path = path.replace(/^\/api/, "");
  return (
    path
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":id")
      .replace(/\/[0-9a-f]{24}(?=\/|$)/gi, "/:id")
      .replace(/\/\d+(?=\/|$)/g, "/:id")
      .replace(/\/(PROJECT%20-%20|PROJECT - )[^/]+/gi, "/:id") || "/"
  );
};

const resourceOf = (route) => route.split("/").filter((p) => p && p !== ":id")[0] || "root";

export const installApiTelemetry = () => {
  axios.interceptors.request.use((config) => {
    config.metadata = { start: performance.now() };
    return config;
  });

  axios.interceptors.response.use(
    (response) => {
      try {
        const { config } = response;
        const method = (config.method || "get").toUpperCase();
        const route = routeOf(config.url);
        const ms = Math.round(performance.now() - (config.metadata?.start ?? performance.now()));

        if (method !== "GET" && !NOISY.some((re) => re.test(route))) {
          trackEvent("api_mutation", {
            method,
            route,
            resource: resourceOf(route),
            status: response.status,
            duration_ms: ms,
          });
        }

        if (ms >= SLOW_MS) {
          const key = `${method} ${route}`;
          const now = Date.now();
          if (now - (lastSlow.get(key) || 0) > SLOW_REPEAT_MS) {
            lastSlow.set(key, now);
            trackEvent("api_slow", { method, route, resource: resourceOf(route), duration_ms: ms });
          }
        }
      } catch (_) {}
      return response;
    },
    (error) => {
      try {
        const config = error.config || {};
        const method = (config.method || "get").toUpperCase();
        const route = routeOf(config.url);
        const status = error.response?.status ?? 0;
        // A 401 from the "who am I" check just means "not signed in".
        if (!(status === 401 && /^\/auth\/me$/.test(route)) && !axios.isCancel(error)) {
          trackEvent("api_error", {
            method,
            route,
            resource: resourceOf(route),
            status,
            error_code: error.code,
            duration_ms: Math.round(performance.now() - (config.metadata?.start ?? performance.now())),
          });
        }
      } catch (_) {}
      return Promise.reject(error);
    },
  );
};
