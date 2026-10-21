import {
  buildWorksheetCsv,
  countActiveFilters,
  countTabs,
  emptyFilters,
  filterWorkItems,
  sortWorkItems,
} from "@/lib/worksheetView";

jest.mock("@/analytics", () => ({ trackEvent: jest.fn() }));

const items = [
  { id: "1", stage: "Content", work_date: "2026-10-02", month: "2026-10", created_at: "a", deliverable_name: "Carousel A", creator_id: "u1", project_id: "p1", status: "Done", quantity: 1 },
  { id: "2", stage: "Design", work_date: "2026-10-05", month: "2026-10", created_at: "b", deliverable_name: "Reel B", creator_id: "u2", project_id: "p1", status: "Review", quantity: 3 },
  { id: "3", stage: "Animate", work_date: "2026-09-30", month: "2026-09", created_at: "c", deliverable_name: "Anim C", creator_id: "u1", project_id: "p2", status: "Done", quantity: 1 },
  { id: "4", stage: "Content", work_date: "2026-10-05", month: "2026-10", created_at: "d", deliverable_name: "Post D", creator_id: "u2", project_id: "p2", status: "Done", quantity: 1 },
];
const projectById = new Map([["p1", { id: "p1", name: "ICICI Contra", client_id: "c1" }], ["p2", { id: "p2", name: "Other", client_id: "c2" }]]);
const clientNameById = new Map([["c1", "ICICI"], ["c2", "Zed"]]);
const userNameById = new Map([["u1", "Asha"], ["u2", "Ben"]]);

const base = {
  items, filters: emptyFilters, deferredSearch: "", month: "", activeSheet: "Master",
  clientNameById, projectById, userNameById, onlyMissing: false, deliverableTypeCategories: undefined,
};
const ids = (rows) => rows.map((r) => r.id);

test("department sheets show only their own stage; Master shows all", () => {
  expect(ids(filterWorkItems(base))).toEqual(["1", "2", "3", "4"]);
  expect(ids(filterWorkItems({ ...base, activeSheet: "Content" }))).toEqual(["1", "4"]);
  expect(ids(filterWorkItems({ ...base, activeSheet: "Animation" }))).toEqual(["3"]);
});

test("month and status filters narrow the rows", () => {
  expect(ids(filterWorkItems({ ...base, month: "2026-10" }))).toEqual(["1", "2", "4"]);
  expect(ids(filterWorkItems({ ...base, filters: { ...emptyFilters, statuses: ["Review"] } }))).toEqual(["2"]);
});

test("search matches words in any order across client, project, owner", () => {
  expect(ids(filterWorkItems({ ...base, deferredSearch: "icici carousel" }))).toEqual(["1"]);
  expect(ids(filterWorkItems({ ...base, deferredSearch: "ben" }))).toEqual(["2", "4"]);
});

test("tab counts follow the month and ignore filters", () => {
  expect(countTabs({ items, month: "", projectTasks: null })).toEqual({ Master: 4, Content: 2, Design: 1, Animate: 1 });
  expect(countTabs({ items, month: "2026-10", projectTasks: null }).Master).toBe(3);
  const withTasks = countTabs({ items, month: "2026-10", projectTasks: { tasks: [{ start_date: "2026-10-01" }, { start_date: "2026-09-01" }] } });
  expect(withTasks.Projects).toBe(1);
});

test("sort: by date either way, ties newest-created first", () => {
  expect(ids(sortWorkItems(items, "desc"))).toEqual(["4", "2", "1", "3"]);
  expect(ids(sortWorkItems(items, "asc"))).toEqual(["3", "1", "4", "2"]);
});

test("active filter count adds up the list filters and the date range", () => {
  expect(countActiveFilters(emptyFilters)).toBe(0);
  expect(countActiveFilters({ ...emptyFilters, date_from: "x", date_to: "y", project_ids: ["a", "b"], statuses: ["Done"] })).toBe(4);
});

test("csv: header, rows and excluded columns", () => {
  const { header, rows, filename } = buildWorksheetCsv({
    sortedItems: [items[1]], activeSheet: "Design", excludedColumns: ["Qty"], month: "2026-10",
    projectById, clientNameById, userNameById,
  });
  expect(header).not.toContain("Qty");
  expect(header).toContain("Duration (sec)");
  expect(rows[0][1]).toBe("ICICI");
  expect(rows[0][2]).toBe("ICICI Contra");
  expect(rows[0]).toContain("Ben");
  expect(filename).toMatch(/^worksheet-design-2026-10-\d{4}/);
});
