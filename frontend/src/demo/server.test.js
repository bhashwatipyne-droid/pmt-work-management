import { handleDemoRequest } from "./server";

const call = (method, path, extra = {}) => handleDemoRequest({ method, path, query: {}, body: {}, ...extra });

describe("demo server", () => {
  it("signs in as the demo admin", () => {
    expect(call("GET", "/auth/me")).toMatchObject({ role: "admin" });
  });

  it("serves the dropdown data the Work Sheet needs", () => {
    const lookups = call("GET", "/worksheet/lookups");
    expect(lookups.clients.length).toBeGreaterThan(3);
    expect(lookups.projects.length).toBeGreaterThan(5);
    expect(lookups.deliverables.length).toBeGreaterThan(20);
  });

  it("builds the home dashboard with a mix of on-track and late work", () => {
    const home = call("GET", "/dashboard/home", { query: {} });
    const buckets = new Set(home.deliverables.map((d) => d.bucket));
    expect(buckets.has("on")).toBe(true);
    expect(buckets.has("delay")).toBe(true);
    expect(home.monthly).toHaveLength(12);
    expect(home.trend).toHaveLength(6);
  });

  it("scores efficiency for the current month", () => {
    const month = new Date().toISOString().slice(0, 7);
    const overview = call("GET", "/efficiency/overview", { query: { month } });
    expect(overview.kpis.employees_tracked).toBeGreaterThan(5);
    expect(overview.kpis.team_productivity).toBeGreaterThan(0);
  });

  it("lists, creates and deletes work rows", () => {
    const before = call("GET", "/work-items", { query: {} }).length;
    const created = call("POST", "/work-items", { body: { deliverable_name: "Demo row", time_taken_minutes: 30 } });
    expect(created.deliverable_name).toBe("Demo row");
    expect(call("GET", "/work-items", { query: {} })).toHaveLength(before + 1);
    call("DELETE", `/work-items/${created.id}`);
    expect(call("GET", "/work-items", { query: {} })).toHaveLength(before);
  });

  it("approving the last pending approval moves the deliverable on", () => {
    const board = call("GET", "/approvals/board", { query: {} });
    const item = board.MANAGER[0];
    expect(item).toBeDefined();
    call("POST", `/approval-items/${item.id}/approve`, { body: { note: "" } });
    const after = call("GET", "/approvals/board", { query: {} });
    expect(after.MANAGER.find((i) => i.id === item.id)).toBeUndefined();
  });

  it("plans the week and lists the meetings", () => {
    const plan = call("GET", "/planning/overview");
    expect(plan.tasks.length).toBeGreaterThan(10);
    expect(plan.people.length).toBeGreaterThan(5);
    expect(plan.ctx.days).toHaveLength(5);

    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(today.getFullYear(), today.getMonth() + 1, 1).toISOString().slice(0, 10);
    expect(call("GET", "/meetings", { query: { start: from, end: to } }).length).toBeGreaterThan(20);
    expect(call("GET", "/meetings/status").configured).toBe(true);
  });
});
