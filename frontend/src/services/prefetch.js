import { getWorkItems, getWorksheetLookups } from "@/services/api";

// Starts the Work Sheet's data requests while the app is still booting.
//
// Without this the load is a chain: download the app -> ask "who am I?"
// (/auth/me) -> render -> download the Work Sheet chunk -> only THEN start the
// data requests. Every link in that chain costs at least one full network
// round trip. The data requests do not need the result of /auth/me (the
// session cookie / token is sent with them either way), so they can run in
// parallel with it. When the Work Sheet mounts it picks these up instead of
// asking again.
//
// If the person is not signed in the prefetch simply fails and is ignored;
// consumePrefetch then falls back to a normal request.

export const WORKSHEET_INITIAL_ROW_LIMIT = 300;

// A prefetched answer older than this is not trusted (e.g. the login page was
// open for a while before signing in) - a fresh request is made instead.
const PREFETCH_MAX_AGE_MS = 20000;

const store = new Map();

const startPrefetch = (key, fetcher) => {
  const promise = fetcher();
  promise.catch(() => {}); // never an unhandled rejection
  store.set(key, { at: Date.now(), promise });
};

export const prefetchWorksheet = () => {
  startPrefetch("worksheet-lookups", getWorksheetLookups);
  startPrefetch("worksheet-items-initial", () =>
    getWorkItems("", { limit: WORKSHEET_INITIAL_ROW_LIMIT })
  );
};

// Returns a promise for `key`: the prefetched one if there is a fresh one
// (each is handed out once), otherwise the result of `fetcher()`. A failed
// prefetch also falls through to `fetcher()`.
export const consumePrefetch = (key, fetcher) => {
  const entry = store.get(key);
  store.delete(key);

  if (entry && Date.now() - entry.at < PREFETCH_MAX_AGE_MS) {
    return entry.promise.catch(() => fetcher());
  }

  return fetcher();
};