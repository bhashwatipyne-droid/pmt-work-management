import { act } from "react";
import { createRoot } from "react-dom/client";
import WorkSheetPage from "@/pages/WorkSheetPage";

// A long scripted scenario: it sits close to Jest's 5s default on a busy machine.
jest.setTimeout(30000);

jest.mock("react-router-dom", () => ({ useNavigate: () => (p, o) => globalThis.__log.push(["navigate", p, o]), useLocation: () => ({ state: null, pathname: "/", key: "k" }) }), { virtual: true });
jest.mock("@/analytics", () => ({ trackEvent: (n, p) => globalThis.__log.push(["track", n, p]) }));
jest.mock("sonner", () => ({ toast: Object.assign((m) => globalThis.__log.push(["toast", m]), { error: (m) => globalThis.__log.push(["toast.error", m]), success: (m) => globalThis.__log.push(["toast.success", m]) }) }));
jest.mock("@/context/UserContext", () => ({ useUser: () => ({ currentUser: globalThis.__user, currentUserId: globalThis.__user.id, users: globalThis.__users, loading: false }) }));
jest.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
jest.mock("@/lib/appActions", () => ({ APP_ACTIONS: { ADD_ROW: "add-row", QUICK_LOG: "quick-log" }, registerAppAction: () => () => {}, peekQuickLogPreset: () => null, clearQuickLogPreset: () => {} }));
jest.mock("@/lib/countsBus", () => ({ refreshCounts: () => globalThis.__log.push(["refreshCounts"]) }));
jest.mock("@/lib/exportCsv", () => ({ downloadCsv: (...a) => globalThis.__log.push(["csv", a[0], a[1]?.length]), todayStamp: () => "2026-10-21" }));
jest.mock("@/services/prefetch", () => ({ consumePrefetch: (_k, fetcher) => fetcher(), WORKSHEET_INITIAL_ROW_LIMIT: 500 }));
const cap = (name) => (p) => { (globalThis.__p = globalThis.__p || {})[name] = p; return null; };
jest.mock("@/components/work-sheet/WorkSheetToolbar", () => ({ WorkSheetToolbar: (p) => cap("toolbar")(p) }));
jest.mock("@/components/work-sheet/WorkSheetTabs", () => ({ WorkSheetTabs: (p) => cap("tabs")(p) }));
jest.mock("@/components/work-sheet/ProjectsSheet", () => ({ ProjectsSheet: (p) => cap("projectsSheet")(p), prefetchProjectSheet: () => Promise.resolve({ data: [{ id: "t1", status: "Open" }] }) }));
jest.mock("@/components/work-sheet/WorkSheetTable", () => {
  const React = require("react");
  return { SHEET_EXCLUDED_COLUMNS: {}, excludedColumnsFor: () => [], WorkSheetTable: React.forwardRef((p, ref) => { React.useImperativeHandle(ref, () => ({ resetColumnSort: () => {}, scrollToRow: () => {}, focusFirstCell: () => {} })); return cap("table")(p); }) };
});
jest.mock("@/components/work-sheet/WorksheetFilterPanel", () => ({ WorksheetFilterPanel: (p) => cap("filterPanel")(p) }));
jest.mock("@/components/ui/ConfirmDeleteModal", () => ({ __esModule: true, default: (p) => cap(p.confirmLabel === "Delete Entry" ? "confirmOne" : "confirmBulk")(p) }));
jest.mock("@/components/work-sheet/BulkActionBar", () => ({ BulkActionBar: (p) => cap("bulkBar")(p) }));
jest.mock("@/components/work-sheet/MobileWorkList", () => ({ MobileWorkList: () => null }));
jest.mock("@/components/work-sheet/QuickLogTrigger", () => ({ QuickLogTrigger: (p) => cap("quickTrigger")(p) }));
jest.mock("@/components/work-sheet/QuickLoggerModal", () => ({ __esModule: true, default: (p) => cap("quickLogger")(p) }));
jest.mock("@/components/work-sheet/WorkSheetHistory", () => ({ WorkSheetHistory: (p) => cap("history")(p) }));
jest.mock("@/components/skeletons/Skeletons", () => ({ WorkSheetSkeleton: () => null, WorkSheetTableSkeleton: () => null }));
jest.mock("@/services/api", () => {
  const today = new Date().toISOString().slice(0, 10);
  const base = (id, o) => ({ id, stage: "Content", work_date: today, deliverable_name: `Row ${id}`, creator_id: "u1", status: "Not Started", created_at: `c${id}`, time_taken_minutes: 0, project_id: "p1", deliverable_id: "d1", deliverable_type: "", reviewer_id: "", ...o });
  const rows = () => [
    base("1", { time_taken_minutes: 30 }),
    base("2", { deliverable_id: "", creator_id: "u2" }),
    base("3", { status: "Done", time_taken_minutes: 45, stage: "Design", creator_id: "u2", reviewer_id: "u3" }),
    base("4", { deliverable_type: "Carousel", stage: "Design" }),
    base("5", { time_taken_minutes: 0, deliverable_id: "d1" }),
  ];
  globalThis.__rows = rows;
  const rec = (name, impl) => (...a) => {
    globalThis.__log.push([name, ...a]);
    if (globalThis.__fail === name) { globalThis.__fail = null; return Promise.reject({ response: { data: { detail: `${name} failed` } } }); }
    return impl ? impl(...a) : Promise.resolve([]);
  };
  const find = (id) => globalThis.__store.find((r) => r.id === id);
  return {
    getWorkItems: rec("getWorkItems", () => Promise.resolve(globalThis.__store)),
    getOptions: () => Promise.resolve({ stages: ["Content", "Design"], statuses: ["Not Started", "Ready for Review", "Done", "Ongoing"], deliverable_types: ["Carousel"], deliverable_type_categories: { Carousel: "Design" } }),
    getClients: () => Promise.resolve([{ id: "c1", name: "ICICI" }]),
    getProjects: () => Promise.resolve([{ id: "p1", name: "Contra", client_id: "c1" }]),
    getDeliverables: () => Promise.resolve([{ id: "d1", name: "Carousel A", project_id: "p1" }]),
    getAllDeliverables: () => Promise.resolve([{ id: "d1", name: "Carousel A", project_id: "p1" }]),
    updateWorkItem: rec("updateWorkItem", (uid, id, patch) => Promise.resolve({ ...find(id), ...patch })),
    deleteWorkItem: rec("deleteWorkItem", () => Promise.resolve({})),
    bulkUpdateWorkItems: rec("bulkUpdateWorkItems", (uid, ids, patch) => Promise.resolve(ids.map((id) => ({ ...find(id), ...patch })))),
    bulkDeleteWorkItems: rec("bulkDeleteWorkItems", () => Promise.resolve({})),
    createWorkItem: rec("createWorkItem", (uid, body) => Promise.resolve({ id: "new1", ...body, created_at: "zz" })),
    bulkCreateWorkItems: rec("bulkCreateWorkItems", () => Promise.resolve([])),
    addWorkItemCollaborators: rec("addWorkItemCollaborators", () => Promise.resolve({})),
    restoreWorkItems: rec("restoreWorkItems", () => Promise.resolve([])),
    getWorksheetLookups: () => Promise.resolve({ clients: [{ id: "c1", name: "ICICI" }], projects: [{ id: "p1", name: "Contra", client_id: "c1" }], deliverables: [{ id: "d1", name: "Carousel A", project_id: "p1" }] }),
    getProjectTasks: () => Promise.resolve([]),
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const wait = (ms = 15) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const P = () => globalThis.__p;
const snap = () => {
  const p = P();
  const t = p.table;
  return JSON.stringify(t ? {
    rows: t.items.map((i) => [i.id, i.status, i.time_taken_minutes, i.deliverable_id, i.reviewer_id, i.stage, i.project_id]),
    sel: t.selectedIds, hidden: t.hiddenRows, sheet: t.sheetKey, group: t.groupBy, dir: t.sortDirection,
    tabs: p.tabs?.counts, activeSheet: p.tabs?.activeSheet,
    tb: { rc: p.toolbar.resultCount, tc: p.toolbar.totalCount, miss: p.toolbar.missingDeliverableCount, only: p.toolbar.onlyMissing, month: p.toolbar.month, afc: p.toolbar.activeFilterCount, group: p.toolbar.groupBy, search: p.toolbar.filters?.search },
    bulk: p.bulkBar ? { n: p.bulkBar.selectedCount, collab: p.bulkBar.collabPeople } : null,
    keys: Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Object.keys(v).sort().map((x) => x + (typeof v[x] === "function" ? "()" : "")).join(",")])),
    ext: { qt: !!p.quickTrigger, ql: p.quickLogger && [p.quickLogger.open, p.quickLogger.projects?.length, p.quickLogger.clients?.length], hist: p.history && [p.history.open, p.history.stage] },
    confirm: [p.confirmOne?.open, p.confirmBulk?.open, p.confirmBulk?.title], collab: [...(t.collabIndex || new Map())],
  } : { projectsSheet: true, tabs: p.tabs?.counts });
};

const scenario = async (label, user) => {
  globalThis.__log = []; globalThis.__undos = []; globalThis.__p = {}; globalThis.__fail = null;
  globalThis.__user = user;
  globalThis.__users = [{ id: "u1", name: "Asha", role: "manager", department: "Design" }, { id: "u2", name: "Ben", role: "member", department: "Content" }, { id: "u3", name: "Cara", role: "manager", department: "Design" }];
  globalThis.__store = globalThis.__rows();
  localStorage.clear();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<WorkSheetPage />); });
  await wait(60);
  const out = [`## ${label}`];
  const step = async (name, fn) => { await act(async () => { try { await fn(P()); } catch (e) { globalThis.__log.push(["threw", String(e && (e.message || e.response?.data?.detail || e))]); } }); await wait(); out.push(name + " " + snap()); };
  out.push("init " + snap());
  if (P().tabs?.activeSheet === "Projects") await step("to master", (p) => p.tabs.onChange("Master"));
  await step("tab design", (p) => p.tabs.onChange("Design"));
  await step("tab master", (p) => p.tabs.onChange("Master"));
  await step("update status ok", async (p) => { out.push("ret " + JSON.stringify(await p.table.onUpdate("1", { status: "Ongoing" }))); });
  await step("update to review no reviewer", async (p) => { out.push("ret " + JSON.stringify(await p.table.onUpdate("1", { status: "Ready for Review" }))); });
  await step("update gated no deliverable", async (p) => { out.push("ret " + JSON.stringify(await p.table.onUpdate("2", { status: "Ongoing" }))); });
  await step("update gated no time", async (p) => { out.push("ret " + JSON.stringify(await p.table.onUpdate("5", { status: "Ongoing" }))); });
  await step("update project/stage ls", async (p) => { await p.table.onUpdate("3", { project_id: "p1", deliverable_id: "d1", stage: "Design", remarks: "x" }); out.push("ls " + JSON.stringify(Object.entries(localStorage).sort())); });
  globalThis.__fail = "updateWorkItem";
  await step("update fails", async (p) => { out.push("ret " + JSON.stringify((({ success }) => ({ success }))(await p.table.onUpdate("1", { remarks: "boom" })))); });
  await step("update skipUndo", (p) => p.table.onUpdate("1", { time_taken_minutes: 99 }, { skipUndo: true }));
  await step("update no change", (p) => p.table.onUpdate("1", { time_taken_minutes: 99 }));
  await step("fill bad time", (p) => p.table.onFill(["1", "2"], "time_taken_minutes", "abc"));
  await step("fill good time", (p) => p.table.onFill(["1", "2"], "time_taken_minutes", "45"));
  await step("fill status", (p) => p.table.onFill(["1", "3"], "status", "Done"));
  await step("fill empty", (p) => p.table.onFill([], "status", "Done"));
  globalThis.__fail = "bulkUpdateWorkItems";
  await step("fill fails", (p) => p.table.onFill(["1"], "remarks", "zzz"));
  await step("select", (p) => p.table.onToggleSelect("1"));
  await step("select 2", (p) => p.table.onToggleSelect("2"));
  await step("deselect", (p) => p.table.onToggleSelect("1"));
  await step("select range", (p) => p.table.onSelectRange(["1", "2", "3"]));
  await step("select all", (p) => p.table.onToggleSelectAll());
  await step("select all again", (p) => p.table.onToggleSelectAll());
  await step("bulk status", (p) => p.bulkBar && p.bulkBar.onApplyStatus && p.bulkBar.onApplyStatus("Ongoing"));
  await step("select again", (p) => p.table.onSelectRange(["1", "2"]));
  await step("bulk status 2", (p) => p.bulkBar.onApplyStatus("Ongoing"));
  await step("bulk assign", (p) => p.bulkBar.onApplyAssign && p.bulkBar.onApplyAssign("u3"));
  await step("hide rows", (p) => p.bulkBar.onHideRows());
  await step("request hide", (p) => p.table.onRequestHideRow("3"));
  await step("select again 2", (p) => p.table.onSelectRange(["1", "3"]));
  await step("bulk delete open", (p) => p.bulkBar.onDelete());
  await step("bulk delete confirm", (p) => p.confirmBulk.onConfirm());
  await step("select again 3", (p) => p.table.onSelectRange(["2"]));
  await step("bulk delete confirm fail", async (p) => { globalThis.__fail = "bulkDeleteWorkItems"; await p.bulkBar.onDelete(); await P().confirmBulk.onConfirm(); });
  await step("clear sel", (p) => p.bulkBar && p.bulkBar.onClear());
  await step("delete open", (p) => p.table.onDelete({ id: "4", deliverable_name: "Row 4" }));
  await step("delete confirm", (p) => p.confirmOne.onConfirm());
  await step("delete open 2", (p) => p.table.onDelete({ id: "2", deliverable_name: "Row 2" }));
  await step("delete fails", async (p) => { globalThis.__fail = "deleteWorkItem"; await p.confirmOne.onConfirm(); });
  await step("delete close", (p) => p.confirmOne.onClose());
  await step("date sort", (p) => p.table.onDateSort());
  await step("date sort 2", (p) => p.table.onDateSort());
  await step("group by", (p) => p.toolbar.onGroupByChange("Stage"));
  await step("collapse all", (p) => p.toolbar.onToggleCollapseAll());
  await step("only missing", (p) => p.toolbar.onToggleMissing());
  await step("only missing off", (p) => p.toolbar.onToggleMissing());
  await step("month", (p) => p.toolbar.onMonthChange("2026-09"));
  await step("month back", (p) => p.toolbar.onMonthChange(p.toolbar.currentMonth));
  await step("search", (p) => p.toolbar.setFilters({ ...p.toolbar.filters, search: "Row 3" }));
  await wait(40);
  out.push("after search " + snap());
  await step("filter status", (p) => p.toolbar.setFilters({ ...P().toolbar.filters, search: "", statuses: ["Done"] }));
  await step("filter clear", (p) => p.toolbar.setFilters({ ...P().toolbar.filters, statuses: [] }));
  await step("export", (p) => p.toolbar.onExport());
  await step("add collaborators", (p) => p.table.onAddCollaborators && p.table.onAddCollaborators(["1"], ["u3"]));
  await step("duplicate", (p) => p.table.onDuplicateRow({ id: "1" }));
  await step("add row", (p) => p.toolbar.onAddRow());
  await step("open quick logger", (p) => p.quickTrigger && p.quickTrigger.onOpen());
  await step("quick logger save", (p) => p.quickLogger.onSave([{ client_id: "c1", project_id: "p1", deliverable_id: "d1", deliverable_type: "Carousel", time_taken_minutes: 20, stage: "Design" }]));
  await step("open history", (p) => p.toolbar.onOpenHistory());
  for (const u of globalThis.__undos) { await act(async () => { try { await u(); } catch (e) { globalThis.__log.push(["undo threw", String(e.message)]); } }); }
  await wait();
  out.push("end " + snap());
  out.push("LOG " + JSON.stringify(globalThis.__log.map((l) => l.map((x) => (typeof x === "function" ? "fn" : x)))));
  await act(async () => root.unmount());
  host.remove();
  return out.join("\n");
};

test("work sheet page actions", async () => {
  const mgr = { id: "u1", role: "manager", name: "Asha", department: "Design" };
  const member = { id: "u2", role: "member", name: "Ben", department: "Content" };
  const admin = { id: "a1", role: "admin", name: "Root" };
  const res = [await scenario("manager", mgr), await scenario("member", member), await scenario("admin", admin)];
  expect(res.join("").length).toBeGreaterThan(1000);
});
