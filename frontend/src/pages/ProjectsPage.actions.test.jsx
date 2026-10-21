import { act } from "react";
import { createRoot } from "react-dom/client";
import ProjectsPage from "@/pages/ProjectsPage";

jest.mock("react-router-dom", () => ({ useNavigate: () => (p) => (globalThis.__log.push(["navigate", p])), useLocation: () => ({ state: null, pathname: "/projects" }) }), { virtual: true });
jest.mock("@/analytics", () => ({ trackEvent: (n, p) => globalThis.__log.push(["track", n, p]) }));
jest.mock("sonner", () => ({ toast: { error: (m) => globalThis.__log.push(["toast.error", m]), success: (m) => globalThis.__log.push(["toast.success", m]) } }));
jest.mock("@/context/UserContext", () => ({ useUser: () => ({ currentUser: { id: "u1", role: "admin", name: "Asha" }, currentUserId: "u1", loading: false }) }));
jest.mock("@/hooks/useAccess", () => ({ useAccess: () => ({ canManageProjects: true }) }));
jest.mock("@/hooks/useUndo", () => ({ useUndo: () => ({ pushUndo: (label, fn) => { globalThis.__log.push(["undo", label]); globalThis.__undos.push(fn); } }) }));
jest.mock("@/components/projects/CreateProjectModal", () => ({ CreateProjectModal: () => null }));
jest.mock("@/components/ui/ConfirmDeleteModal", () => ({ __esModule: true, default: (p) => { globalThis.__confirm = p; return null; } }));
jest.mock("@/lib/exportCsv", () => ({ downloadCsv: (...a) => globalThis.__log.push(["csv", ...a]), todayStamp: () => "2026-10-21" }));
const cap = (p) => { globalThis.__ctx = { ...(globalThis.__ctx || {}), ...p }; return null; };
jest.mock("@/components/projects/page/ProjectsContent", () => ({ ProjectsContent: (p) => cap(p) }));
jest.mock("@/components/projects/page/ProjectsBulkBar", () => ({ ProjectsBulkBar: (p) => cap(p) }));
jest.mock("@/components/projects/page/ProjectsFilterChips", () => ({ ProjectsFilterChips: (p) => cap(p) }));
jest.mock("@/components/projects/page/ProjectsToolbar", () => ({ ProjectsToolbar: (p) => cap(p) }));
jest.mock("@/services/api", () => {
  const rec = (name, ret) => (...a) => {
    globalThis.__log.push([name, ...a]);
    if (globalThis.__fail === name) { globalThis.__fail = null; return Promise.reject({ response: { data: { detail: `${name} failed` } } }); }
    return Promise.resolve(ret);
  };
  const projects = [
    { id: "p1", name: "ICICI Contra", status: "Active", client_id: "c1", client_name: "ICICI", client_poc: "Asha", end_date: "2026-11-02", kanban_order: 0, start_date: "2026-10-01", description: "d1" },
    { id: "p2", name: "ICICI Contra Fund", status: "Active", client_id: "c1", client_name: "ICICI", end_date: "2026-12-02", kanban_order: 1, start_date: "2026-10-02" },
    { id: "p3", name: "Zed Launch", status: "On Hold", client_id: "c2", client_name: "Zed", kanban_order: 0, start_date: "2026-09-01" },
    { id: "p4", name: "Zed Launch 2", status: "Completed", client_id: "c2", client_name: "Zed", kanban_order: 0, start_date: "2026-08-01" },
    { id: "p5", name: "Acme Web", status: "Active", client_id: "c3", client_name: "Acme", kanban_order: 2, start_date: "2026-07-01", end_date: "2026-11-30" },
  ];
  return {
    getProjects: rec("getProjects", projects),
    getProjectMetrics: () => Promise.resolve({ total: 5 }),
    getClients: () => Promise.resolve([{ id: "c1", name: "ICICI", contact_persons: [] }]),
    getOptions: () => Promise.resolve({ deliverable_types: [] }),
    getDeliverableNamesByProject: () => Promise.resolve({ p3: ["reel launch video"] }),
    hideProject: rec("hideProject"), unhideProject: rec("unhideProject"), deleteProject: rec("deleteProject"),
    bulkHideProjects: rec("bulkHideProjects"), bulkUnhideProjects: rec("bulkUnhideProjects"),
    bulkUpdateProjectStatus: rec("bulkUpdateProjectStatus"), bulkDeleteProjects: rec("bulkDeleteProjects"),
    reorderProjects: rec("reorderProjects"),
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const wait = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const ids = (l) => (l || []).map((p) => p.id).join(",");
const snap = () => {
  const c = globalThis.__ctx;
  return JSON.stringify({
    sel: [...c.selectedProjects].sort(), filtered: ids(c.filtered), sorted: ids(c.sortedFiltered),
    by: Object.fromEntries(Object.entries(c.byStatus).map(([k, v]) => [k, ids(v)])),
    look: [...c.lookalikeTextById], hidden: c.hiddenStatuses, visible: c.visibleStatuses, width: c.boardWidth,
    over: [c.dragOverProjectId, c.dragOverStatus], page: c.listPage, view: c.view, afc: c.activeFilterCount,
    vis: c.visibility, sort: c.sortBy, mode: c.selectionMode, clients: c.clientOptions, pocs: c.pocOptions, pending: c.searchPending,
    status: c.statusFilter, client: c.clientFilter, search: c.search,
  });
};
const dt = () => ({ setData: () => {}, effectAllowed: "", dropEffect: "" });
const ev = () => ({ preventDefault: () => {}, stopPropagation: () => {}, dataTransfer: dt() });

test("projects page handlers behave the same", async () => {
  globalThis.__log = []; globalThis.__undos = []; globalThis.__ctx = {};
  localStorage.clear();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<ProjectsPage />); });
  await wait(60);
  const out = [];
  const step = async (label, fn) => { await act(async () => { await fn(globalThis.__ctx); }); await wait(); out.push(label + " " + snap()); };

  out.push("init " + snap());
  await step("select p1", (c) => c.toggleProjectSelection("p1"));
  await step("selectPage", (c) => c.selectPage(["p2", "p3"], true));
  await step("deselectPage", (c) => c.selectPage(["p2"], false));
  await step("selectColumn", (c) => c.stableSelectColumn(c.byStatus["Active"]));
  await step("selectColumn again", (c) => c.stableSelectColumn(c.byStatus["Active"]));
  await step("selectAll", (c) => c.selectAllFiltered());
  await step("clearSel", (c) => c.clearSelection());
  await step("search", (c) => c.setSearch("launch"));
  await wait(60);
  out.push("after search " + snap());
  await step("search clear", (c) => c.setSearch(""));
  await step("status filter", (c) => c.setStatusFilter("Active"));
  await step("client filter", (c) => c.setClientFilter("c1"));
  await step("dates", (c) => { c.setDateFrom("2026-11-01"); c.setDateTo("2026-12-01"); });
  await step("clearFilters", (c) => c.clearFilters());
  await step("sort", (c) => c.setSortBy("name"));
  await step("sort lookalike", (c) => c.setSortBy("lookalike"));
  await step("sort none", (c) => c.setSortBy(""));
  await step("view list", (c) => c.setView("list"));
  await step("listPage", (c) => c.setListPage(2));
  await step("toggle col", (c) => c.toggleColumnVisibility("On Hold"));
  await step("toggle col again", (c) => c.toggleColumnVisibility("On Hold"));
  out.push("storage " + localStorage.getItem("pmt-hidden-project-columns"));
  await step("visibility", (c) => c.handleVisibilityChange("hidden"));
  await step("visibility back", (c) => c.handleVisibilityChange("visible"));

  await step("sel for bulk", (c) => c.selectPage(["p1", "p3"], true));
  await step("bulk status", (c) => c.handleBulkStatusChange("Completed"));
  await step("sel again", (c) => c.selectPage(["p1", "p2"], true));
  await step("bulk hide", (c) => c.handleBulkHide());
  await step("sel again2", (c) => c.selectPage(["p4"], true));
  await step("bulk unhide", (c) => c.handleBulkUnhide());
  await step("hide one", (c) => c.handleHideProject({ id: "p5" }));
  await step("unhide one", (c) => c.handleUnhideProject({ id: "p5" }));
  globalThis.__fail = "bulkHideProjects";
  await step("sel3", (c) => c.selectPage(["p2"], true));
  await step("bulk hide fails", (c) => c.handleBulkHide());
  globalThis.__fail = "hideProject";
  await step("hide one fails", (c) => c.handleHideProject({ id: "p2" }));
  globalThis.__fail = "bulkUpdateProjectStatus";
  await step("bulk status fails", (c) => c.handleBulkStatusChange("Scrapped"));
  await step("bulk status noop", (c) => c.handleBulkStatusChange(""));
  await step("delete target bulk", (c) => c.setDeleteTarget("bulk"));
  await act(async () => { await globalThis.__confirm.onConfirm(); });
  await wait();
  out.push("after confirm bulk delete " + snap());
  await step("delete target one", (c) => c.setDeleteTarget({ id: "p3" }));
  await act(async () => { await globalThis.__confirm.onConfirm(); });
  await wait();

  // Drag and drop on the board
  await step("drag start", (c) => c.stableDragStart(ev(), { id: "p1", status: "Active" }));
  await step("drag over self", (c) => c.stableDragOver(ev(), { id: "p1", status: "Active" }));
  await step("drag over p2", (c) => c.stableDragOver(ev(), { id: "p2", status: "Active" }));
  await step("column over", (c) => c.stableColumnDragOver(ev(), "Completed"));
  await step("drop on p2", (c) => c.stableDrop(ev(), { id: "p2", status: "Active" }));
  await step("drag start 2", (c) => c.stableDragStart(ev(), { id: "p5", status: "Active" }));
  await step("column drop", (c) => c.stableColumnDrop(ev(), "Completed"));
  await step("drag start 3", (c) => c.stableDragStart(ev(), { id: "p3", status: "On Hold" }));
  await step("drop on other col card", (c) => c.stableDrop(ev(), { id: "p4", status: "Completed" }));
  await step("drag start 4", (c) => c.stableDragStart(ev(), { id: "p1", status: "Active" }));
  globalThis.__fail = "reorderProjects";
  await step("column drop fails", (c) => c.stableColumnDrop(ev(), "On Hold"));
  await step("drag end", (c) => c.stableDragEnd());
  await step("open project", (c) => c.stableOpenProject({ id: "p9", status: "Active" }));
  await step("export", (c) => c.handleExport());

  // Run the undo callbacks that were registered.
  for (const u of globalThis.__undos) { await act(async () => { await u(); }); }
  await wait();

  out.push("LOG " + JSON.stringify(globalThis.__log));
  expect(out.length).toBeGreaterThan(40);
  await act(async () => root.unmount());
  host.remove();
});
