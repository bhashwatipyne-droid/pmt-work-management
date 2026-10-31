// Public demo mode. Opening /demo on the live site turns this on for the tab:
// every API call is answered in the browser from made-up sample data (see
// demo/adapter.js), so a visitor can click through the whole app without an
// account and without ever touching the real backend or its database.
//
// The flag lives in sessionStorage, so it belongs to this tab only and a normal
// visit to the site (or a real sign-in in another tab) is never affected.

const KEY = "pmt_demo_mode";
const ROLE_KEY = "pmt_demo_role";

let memoryFlag = false; // used when sessionStorage is blocked

const read = (key) => {
  try {
    return window.sessionStorage.getItem(key);
  } catch (_) {
    return null;
  }
};

const write = (key, value) => {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch (_) {
    // blocked storage: the in-memory flag below still works for this page view
  }
};

// Called once, before anything else runs. /demo (or /demo/anything) switches the
// mode on and rewrites the address to the app's home so the router starts there.
export const bootDemoFromUrl = () => {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  if (path === "/demo" || path.startsWith("/demo/")) {
    memoryFlag = true;
    write(KEY, "1");
    window.history.replaceState({}, "", "/dashboard");
  }
};

export const isDemoMode = () => memoryFlag || read(KEY) === "1";

export const exitDemo = () => {
  memoryFlag = false;
  write(KEY, null);
  write(ROLE_KEY, null);
};

// Which sample person the visitor is looking at the app as.
export const DEMO_ROLES = ["admin", "manager", "member"];

export const getDemoRole = () => {
  const stored = read(ROLE_KEY);
  return DEMO_ROLES.includes(stored) ? stored : "admin";
};

export const setDemoRole = (role) => {
  if (DEMO_ROLES.includes(role)) write(ROLE_KEY, role);
};
