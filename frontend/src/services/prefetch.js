import axios from "axios";
import {
  API,
  getApprovalBoard,
  getDashboardHome,
  getEfficiencyOverview,
  getEfficiencyTrend,
  getInvoiceProjects,
  getOptions,
  getProject,
  getProjectMetrics,
  getProjects,
  getProjectTasks,
  getProjectWorkLog,
  getWorkItems,
  getWorksheetLookups,
} from "@/services/api";
import { currentMonth } from "@/lib/homeDashboard";
import { readSessionState } from "@/hooks/useSessionState";

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
  // The Management tab (admins land on it).
  startPrefetch("project-tasks", getProjectTasks);
  startPrefetch("worksheet-items-initial", () =>
    getWorkItems("", {
      limit: WORKSHEET_INITIAL_ROW_LIMIT,
      hide_unassigned_content: true,
    })
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

// Home dashboard: the three requests it makes on open, for the current month.
// Keys include the month so a different month never picks up this answer.
export const prefetchDashboard = () => {
  const month = currentMonth();
  startPrefetch(`dashboard-home:${month}`, () => getDashboardHome(month));
  startPrefetch(`dashboard-eff:${month}`, () => getEfficiencyOverview(month));
  startPrefetch(`dashboard-trend:${month}`, () => getEfficiencyTrend(month, 6));
};

// Planning: today's plan (the page's first request).
export const fetchPlanningOverview = () =>
  axios.get(`${API}/planning/overview`, { params: {} }).then((r) => r.data);

export const prefetchPlanning = () =>
  startPrefetch("planning-overview", fetchPlanningOverview);

// Projects: the first page of projects and the metrics - the two requests the
// board is waiting on. The first page is keyed by the visibility filter the
// page will open with (remembered for this browser tab), so a different
// filter never picks up this answer. The page's own request params must stay
// identical to these (see ProjectsPage.fetchAll).
export const PROJECTS_FIRST_PAGE = 30;

export const prefetchProjects = () => {
  const visibility = readSessionState("projects-visibility", "visible");
  startPrefetch(`projects-first:${visibility}`, () =>
    getProjects("", {
      visibility,
      include_deliverables: false,
      limit: PROJECTS_FIRST_PAGE,
    })
  );
  startPrefetch("projects-metrics", () => getProjectMetrics(""));
};

// Approvals: the board the page opens with.
export const prefetchApprovals = () =>
  startPrefetch("approvals-board", () =>
    getApprovalBoard("", { visibility: "visible" })
  );

// Efficiency: the overview for the month the page opens on. The page uses the
// UTC month (components/efficiency/EfficiencyFilters), which can differ from
// the local month near month end, so it is computed the same way here. The
// month is part of the key, so a mismatch just means a normal request.
const efficiencyMonth = () => new Date().toISOString().slice(0, 7);

export const prefetchEfficiency = () => {
  const month = efficiencyMonth();
  startPrefetch(`efficiency-overview:${month}`, () => getEfficiencyOverview(month));
};

// A project's page: the project, its work log and the dropdown options.
export const prefetchProjectDetail = (projectId) => {
  startPrefetch(`project:${projectId}`, () => getProject("", projectId));
  startPrefetch(`project-worklog:${projectId}`, () => getProjectWorkLog("", projectId));
  startPrefetch("project-options", () => getOptions());
};

// Ready to invoice: the list the page opens on.
export const prefetchInvoicing = () =>
  startPrefetch("invoicing-ready", () => getInvoiceProjects("ready"));

// Download each page's code at boot, in parallel with the sign-in check,
// instead of after it. Only the page for the address being opened is fetched.
const PAGE_CHUNKS = {
  "/dashboard": () => import("@/pages/DashboardPage"),
  "/planning": () => import("@/pages/PlanningPage"),
  "/projects": () => import("@/pages/ProjectsPage"),
  "/approvals": () => import("@/pages/ApprovalsPage"),
  "/efficiency": () => import("@/pages/EfficiencyPage"),
  "/clients": () => import("@/pages/ClientsPage"),
  "/team": () => import("@/pages/TeamPage"),
  "/meetings": () => import("@/pages/MeetingsPage"),
  "/invoicing": () => import("@/pages/InvoicingPage"),
};

export const prefetchForPath = (pathname) => {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") {
    prefetchWorksheet();
    import("@/pages/WorkSheetPage").catch(() => {});
    return;
  }
  if (path === "/dashboard") prefetchDashboard();
  if (path === "/planning") prefetchPlanning();
  if (path === "/projects") prefetchProjects();
  if (path === "/approvals") prefetchApprovals();
  if (path === "/efficiency") prefetchEfficiency();
  if (path === "/invoicing") prefetchInvoicing();
  if (path.startsWith("/projects/")) {
    try {
      const id = decodeURIComponent(path.slice("/projects/".length));
      if (id) prefetchProjectDetail(id);
    } catch {
      // a malformed address just loads the page as usual
    }
    import("@/pages/ProjectDetailPage").catch(() => {});
    return;
  }
  const chunk = PAGE_CHUNKS[path];
  if (chunk) chunk().catch(() => {});
};
