import { act } from "react";
import { createRoot } from "react-dom/client";
import { WorkSheetTable, SHEET_EXCLUDED_COLUMNS } from "./WorkSheetTable";

jest.mock("@/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("./WorkSheetRow", () => ({
  WorkSheetRow: ({ item }) => <tr><td data-testid="row-stub">{item.deliverable_name}</td></tr>,
}));
jest.mock("./WorksheetColumnMenu", () => ({ WorksheetColumnMenu: () => null }));
jest.mock("./FilterMultiSelect", () => ({ FilterMultiSelect: () => null }));
jest.mock("./WorksheetFormulaBar", () => ({ WorksheetFormulaBar: () => null }));
jest.mock("./QuantityPanel", () => ({ QuantityPanel: () => null }));
jest.mock("./RangeSelectionBar", () => ({ RangeSelectionBar: () => null }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver =
  globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };

const items = [
  { id: "1", stage: "Content", work_date: "2026-10-02", deliverable_name: "Carousel A", creator_id: "u1", status: "Done", created_at: "a" },
  { id: "2", stage: "Design", work_date: "2026-10-05", deliverable_name: "Reel B", creator_id: "u1", status: "Not Started", created_at: "b" },
];

test("the table lists a row per item and exposes the per-sheet column exclusions", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const noop = () => {};
  await act(async () => {
    root.render(
      <WorkSheetTable
        items={items}
        currentUser={{ id: "u1", role: "admin", name: "Asha" }}
        users={[{ id: "u1", name: "Asha" }]}
        options={{ statuses: ["Not Started", "Done"] }}
        projects={[]}
        deliverables={[]}
        clients={[]}
        onUpdate={noop}
        onDelete={noop}
        onDuplicateRow={noop}
        onFill={noop}
        collabIndex={new Map()}
        onAddCollaborators={noop}
        onUndoable={noop}
        filters={{}}
        setFilters={noop}
        selectedIds={[]}
        onToggleSelect={noop}
        onToggleSelectAll={noop}
        hiddenRows={[]}
        setHiddenRows={noop}
        onSelectRange={noop}
        sheetKey="Master"
        groupBy="None"
      />,
    );
  });

  const rows = Array.from(host.querySelectorAll('[data-testid="row-stub"]')).map((n) => n.textContent);
  expect(rows).toEqual(expect.arrayContaining(["Carousel A", "Reel B"]));
  expect(host.textContent).toContain("Deliverable");
  expect(typeof SHEET_EXCLUDED_COLUMNS).toBe("object");

  await act(async () => root.unmount());
  host.remove();
});
