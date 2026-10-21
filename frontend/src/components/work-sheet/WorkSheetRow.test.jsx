import { act } from "react";
import { createRoot } from "react-dom/client";
import { WorkSheetRow } from "./WorkSheetRow";

jest.mock("@/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("./SearchableSelect", () => ({ SearchableSelect: () => <span data-testid="select-stub" /> }), { virtual: true });
jest.mock("./ProjectPicker", () => ({ ProjectPicker: () => null }));
jest.mock("./DeliverableMultiPicker", () => ({ DeliverableMultiPicker: () => null }));
jest.mock("./RemarksEditor", () => ({ RemarksEditor: () => null }));
jest.mock("./CollaboratorPicker", () => ({ CollaboratorPicker: () => null }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const item = {
  id: "r1", stage: "Content", work_date: "2026-10-05", deliverable_name: "Carousel A",
  creator_id: "u1", status: "Not Started", time_taken_minutes: 45, quantity: 1, remarks: "note",
};

test("a row renders its cells with the item's values", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const noop = () => {};
  await act(async () => {
    root.render(
      <table>
        <tbody>
          <WorkSheetRow
            item={item}
            index={1}
            currentUser={{ id: "u1", role: "admin", name: "Asha", department: "Content" }}
            users={[{ id: "u1", name: "Asha" }]}
            usersById={{ u1: { id: "u1", name: "Asha" } }}
            options={{ statuses: ["Not Started", "Done"], deliverable_types: [], work_categories: [] }}
            onUpdate={noop}
            onToggleSelect={noop}
            onCellSelect={noop}
            columnOrder={[]}
            totalRows={1}
          />
        </tbody>
      </table>,
    );
  });

  const values = Array.from(host.querySelectorAll("input, textarea")).map((n) => n.value);
  expect(values).toEqual(expect.arrayContaining(["2026-10-05", "45", "note"]));
  expect(host.textContent).toContain("Asha");

  await act(async () => root.unmount());
  host.remove();
});
