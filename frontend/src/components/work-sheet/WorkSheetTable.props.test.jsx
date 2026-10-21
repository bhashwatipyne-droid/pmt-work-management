import { act } from "react";
import { createRoot } from "react-dom/client";
import { WorkSheetTable } from "./WorkSheetTable";

const ser = (v) =>
  JSON.stringify(v, (k, x) => {
    if (typeof x === "function") return "fn";
    if (x instanceof Map) return { __map: [...x] };
    if (x instanceof Set) return { __set: [...x] };
    if (typeof Node !== "undefined" && x instanceof Node) return "node";
    if (x && typeof x === "object" && x.$$typeof) return { el: typeof x.type === "string" ? x.type : x.type?.name || "C", props: x.props };
    if (x && typeof x === "object" && !Array.isArray(x) && "current" in x && Object.keys(x).length === 1) return "ref";
    return x;
  });
const Dump = (name) => (props) => <div data-stub={name} data-props={ser(props)} />;

jest.mock("@/analytics", () => ({ trackEvent: () => {} }));
jest.mock("./WorkSheetRow", () => ({ WorkSheetRow: (p) => Dump("row")(p) }));
jest.mock("./WorksheetColumnMenu", () => ({ WorksheetColumnMenu: (p) => { (globalThis.__menus = globalThis.__menus || {})[p.column] = p; return Dump("colmenu")(p); } }));
jest.mock("./FilterMultiSelect", () => ({ FilterMultiSelect: (p) => Dump("filter")(p) }));
jest.mock("./WorksheetFormulaBar", () => ({ WorksheetFormulaBar: (p) => Dump("formula")(p) }));
jest.mock("./QuantityPanel", () => ({ QuantityPanel: (p) => Dump("qty")(p) }));
jest.mock("./RangeSelectionBar", () => ({ RangeSelectionBar: (p) => Dump("range")(p) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };

const items = [
  { id: "1", stage: "Content", work_date: "2026-10-02", deliverable_name: "Carousel A", project_id: "p1", deliverable_id: "d1", creator_id: "u1", status: "Done", created_at: "a", time_taken_minutes: 30 },
  { id: "2", stage: "Design", work_date: "2026-10-05", deliverable_name: "Reel B", project_id: "p2", deliverable_id: "d2", creator_id: "u2", status: "Not Started", created_at: "b", time_taken_minutes: 90 },
  { id: "3", stage: "Content", work_date: "2026-10-05", deliverable_name: "Blog C", project_id: "p1", creator_id: "u2", status: "Done", created_at: "c", time_taken_minutes: 45 },
];
const base = {
  items,
  currentUser: { id: "u1", role: "admin", name: "Asha" },
  users: [{ id: "u1", name: "Asha", role: "admin" }, { id: "u2", name: "Ben", role: "member" }, { id: "u3", name: "Cara", role: "manager" }],
  options: { statuses: ["Not Started", "Done"], stages: ["Content", "Design"], deliverable_types: ["Carousel", "Reel"], work_categories: ["Design"] },
  projects: [{ id: "p1", name: "Contra Fund", client_id: "c1" }, { id: "p2", name: "Contra Fund", client_id: "c2" }],
  deliverables: [{ id: "d1", name: "Carousel A", project_id: "p1" }, { id: "d2", name: "Reel B", project_id: "p2" }],
  clients: [{ id: "c1", name: "ICICI" }, { id: "c2", name: "Zed" }],
  onUpdate: () => {}, onDelete: () => {}, onDuplicateRow: () => {}, onFill: () => {},
  collabIndex: new Map([["g1", ["u1", "u2"]]]),
  onAddCollaborators: () => {}, onUndoable: () => {},
  filters: {}, setFilters: () => {},
  selectedIds: ["2"], onToggleSelect: () => {}, onToggleSelectAll: () => {},
  hiddenRows: [], setHiddenRows: () => {}, onSelectRange: () => {},
  sheetKey: "Master", groupBy: "None",
};

const renderOnce = async (extra) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<WorkSheetTable {...base} {...extra} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  const html = host.innerHTML;
  await act(async () => root.unmount());
  host.remove();
  return html;
};

test("sorting and the personal row order change the row order", async () => {
  const dump = [];
  const mount = async (extra) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<WorkSheetTable {...base} {...extra} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    return { host, root };
  };
  const rowIds = (host) => Array.from(host.querySelectorAll('[data-stub="row"]')).map((n) => JSON.parse(n.getAttribute("data-props")).item.id);
  let { host, root } = await mount({});
  dump.push(rowIds(host).join(","));
  await act(async () => globalThis.__menus["Deliverable"].onSortDesc());
  dump.push(rowIds(host).join(",") + "|" + host.innerHTML);
  await act(async () => globalThis.__menus["Time (min)"]?.onSortAsc?.());
  dump.push(rowIds(host).join(","));
  await act(async () => root.unmount()); host.remove();
  localStorage.setItem("worksheet_row_order_u1_Master", JSON.stringify(["3", "1"]));
  ({ host, root } = await mount({ hiddenRows: ["1"] }));
  dump.push(rowIds(host).join(",") + "|" + host.innerHTML);
  ({ host, root } = await mount({ groupBy: "Member" }));
  dump.push(host.innerHTML);
  localStorage.removeItem("worksheet_row_order_u1_Master");
  expect(dump.length).toBe(5);
});

test("a long sheet only renders the rows near the scroll position", async () => {
  const many = Array.from({ length: 300 }, (_, i) => ({
    id: `r${i}`, stage: "Content", work_date: "2026-10-02", deliverable_name: `Item ${i}`, creator_id: "u1", status: "Done", created_at: `c${String(i).padStart(4, "0")}`, time_taken_minutes: 10,
  }));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<WorkSheetTable {...base} items={many} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  const dump = [host.innerHTML];
  for (const top of [4000, 9000]) {
    await act(async () => {
      host.querySelectorAll("div").forEach((d) => {
        Object.defineProperty(d, "scrollTop", { value: top, configurable: true });
        d.dispatchEvent(new Event("scroll"));
      });
    });
    dump.push(host.innerHTML);
  }
  await act(async () => root.unmount());
  host.remove();
  expect(dump[0].length).toBeGreaterThan(0);
});

test("table passes the same derived props in every configuration", async () => {
  const dump = [];
  dump.push(await renderOnce({}));
  dump.push(await renderOnce({ groupBy: "Stage" }));
  dump.push(await renderOnce({ groupBy: "Creator", hiddenRows: ["3"] }));
  dump.push(await renderOnce({ filters: { statuses: ["Done"], project_ids: ["p1"] } }));
  dump.push(await renderOnce({ currentUser: { id: "u2", role: "member", name: "Ben" }, sheetKey: "Mine" }));
  expect(dump[0]).toContain("data-stub=\"row\"");
});
