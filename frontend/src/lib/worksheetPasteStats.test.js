import { resolvePasteValue } from "@/lib/worksheetPaste";
import { computeRangeStats } from "@/lib/worksheetRangeStats";

const lookups = {
  clients: [{ id: "c1", name: "ICICI" }],
  projects: [{ id: "p1", name: "Contra Fund", client_id: "c1" }],
  deliverablesByProject: new Map(),
  options: { statuses: ["Not Started", "Done"] },
  nonAdminUsers: [{ id: "u1", name: "Asha" }],
  reviewerUsers: [{ id: "u2", name: "Ben" }],
};
const item = { id: "r1", client_id: "c1", project_id: "p1" };

test("paste: dates, status, remarks and unknown text", () => {
  expect(resolvePasteValue(lookups, "Date", "2026-10-05", item)).toEqual({ work_date: "2026-10-05" });
  expect(resolvePasteValue(lookups, "Date", "—", item)).toEqual({ work_date: "" });
  expect(resolvePasteValue(lookups, "Date", "not a date", item)).toBeNull();
  expect(resolvePasteValue(lookups, "Status", "done", item)).toEqual({ status: "Done" });
  expect(resolvePasteValue(lookups, "Status", "nope", item)).toBeNull();
  expect(resolvePasteValue(lookups, "Remarks", " hi ", item)).toEqual({ remarks: "hi" });
  expect(resolvePasteValue(lookups, "Nope", "x", item)).toBeNull();
});

test("paste: a client name matches case-insensitively and clearing resets the chain", () => {
  expect(resolvePasteValue(lookups, "Client", "icici", item).client_id).toBe("c1");
  const cleared = resolvePasteValue(lookups, "Client", "", item);
  expect(cleared).toMatchObject({ client_id: null, project_id: null, deliverable_id: null });
});

test("range stats: null for a single cell, counts for a block", () => {
  const rows = [
    { id: "1", time_taken_minutes: 30, status: "Done" },
    { id: "2", time_taken_minutes: 0, status: "Not Started" },
    { id: "3", time_taken_minutes: 15, status: "Done" },
  ];
  const getSortValue = (it, col) => (col === "Time (min)" ? it.time_taken_minutes : col === "Status" ? it.status : "");
  const base = { sortedTableItems: rows, visibleColumns: ["Time (min)", "Status"], getSortValue, statusOrder: ["Not Started", "Done"] };

  expect(computeRangeStats({ ...base, rangeSelection: null })).toBeNull();
  expect(computeRangeStats({ ...base, rangeSelection: { anchorRow: 1, row: 1, anchorCol: 0, col: 0 } })).toBeNull();

  const stats = computeRangeStats({ ...base, rangeSelection: { anchorRow: 1, row: 3, anchorCol: 0, col: 1 } });
  expect(stats).toMatchObject({ rows: 3, cols: 2, count: 6, block: { r1: 1, r2: 3, c1: 0, c2: 1 } });
  expect(stats.times).toEqual([30, 15]);
  expect(stats.statusCounts).toEqual([["Not Started", 1], ["Done", 2]]);
});
