import { buildHome } from "./homeDashboard";

const row = (id, project_id, bucket, spilled) => ({
  id, project_id, bucket, stage: "Content",
  month_flags: { new: !spilled, spilled_in: spilled },
});

test("spilled-over work is counted with its projects", () => {
  const data = {
    projects: { p1: {}, p2: {}, p3: {} },
    deliverables: [
      row("a", "p1", "on", false),
      row("b", "p2", "delay", true),
      row("c", "p2", "delay", true),
      row("d", "p3", "risk", true),
    ],
  };
  const h = buildHome({ data, team: "All", filters: {}, userName: {} });
  expect(h.total).toBe(4);
  expect(h.spilled.map((r) => r.id)).toEqual(["b", "c", "d"]);
  expect(h.spilledProjectCount).toBe(2);
  expect(h.projectCount).toBe(3);
});
