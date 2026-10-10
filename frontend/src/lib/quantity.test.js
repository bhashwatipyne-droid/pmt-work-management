import {
  isMultiProjectRow,
  isQtySet,
  loggedCount,
  projectIdsOf,
  projectListPatch,
  qtyApplies,
  quantityOf,
  unitName,
} from "./quantity";

const PEER = "Campaign Ideation Plan (Content Peer Analysis)";

const ideationRow = (extra = {}) => ({
  id: "row-1",
  stage: "Content",
  deliverable_type: PEER,
  project_id: "p1",
  project_ids: ["p1", "p2", "p3"],
  quantity: 3,
  quantity_items: [null, null, null],
  ...extra,
});

const projects = [
  { id: "p1", client_id: "c1" },
  { id: "p2", client_id: "c1" },
  { id: "p3", client_id: "c1" },
  { id: "p4", client_id: "c1" },
];

describe("multi-project (Campaign Ideation Plan) rows", () => {
  test("every Campaign Ideation Plan type on a Content row covers several projects", () => {
    [
      "Campaign Ideation Plan (Includes Keywords)",
      "Campaign Ideation Plan (Quantitative Analysis)",
      PEER,
      "Campaign Ideation Plan (Key Visuals / Taglines)",
    ].forEach((deliverable_type) => {
      expect(isMultiProjectRow(ideationRow({ deliverable_type }))).toBe(true);
    });
  });

  test("other types and other stages do not", () => {
    expect(isMultiProjectRow(ideationRow({ deliverable_type: "Carousel" }))).toBe(false);
    // The meeting type is Non-Core and starts differently.
    expect(isMultiProjectRow(ideationRow({ deliverable_type: "Campaign Ideation Discussions" }))).toBe(false);
    expect(isMultiProjectRow(ideationRow({ stage: "Design" }))).toBe(false);
    expect(isMultiProjectRow(ideationRow({ stage: null }))).toBe(false);
  });

  test("Qty applies, and the quantity is the number of ticked projects", () => {
    const row = ideationRow();
    expect(qtyApplies(row)).toBe(true);
    expect(quantityOf(row)).toBe(3);
    expect(isQtySet(row)).toBe(true);
    expect(unitName(row, {}, 3)).toBe("projects");
    expect(unitName(row, {}, 1)).toBe("project");
  });

  test("a stale stored quantity never wins over the project list", () => {
    expect(quantityOf(ideationRow({ quantity: 1 }))).toBe(3);
  });

  test("a row saved before the list existed covers its one project", () => {
    const legacy = ideationRow({ project_ids: undefined, quantity: 1, quantity_items: [] });
    expect(projectIdsOf(legacy)).toEqual(["p1"]);
    expect(quantityOf(legacy)).toBe(1);
    expect(isQtySet(legacy)).toBe(true);
  });

  test("no project yet: nothing to count, Qty is not set", () => {
    const empty = ideationRow({ project_id: null, project_ids: [], quantity: 1, quantity_items: [] });
    expect(qtyApplies(empty)).toBe(true);
    expect(isQtySet(empty)).toBe(false);
    expect(quantityOf(empty)).toBe(1);
  });

  test("logged count follows the times typed for each project", () => {
    expect(loggedCount(ideationRow({ quantity_items: [20, null, 45] }))).toBe(2);
  });

  test("an ordinary Content row has no quantity", () => {
    const plain = { stage: "Content", deliverable_type: "Carousel", project_id: "p1" };
    expect(qtyApplies(plain)).toBe(false);
    expect(isQtySet(plain)).toBe(false);
  });
});

describe("projectListPatch", () => {
  test("ticking a project adds a unit with no time and keeps the others' times", () => {
    const row = ideationRow({ quantity_items: [20, null, 45] });
    expect(projectListPatch(row, ["p1", "p2", "p3", "p4"], projects)).toEqual({
      project_ids: ["p1", "p2", "p3", "p4"],
      project_id: "p1",
      quantity: 4,
      quantity_items: [20, null, 45, null],
      client_id: "c1",
    });
  });

  test("unticking a project takes its time with it, not the next one's", () => {
    const row = ideationRow({ quantity_items: [20, 30, 45] });
    const patch = projectListPatch(row, ["p1", "p3"], projects);
    expect(patch.quantity).toBe(2);
    expect(patch.quantity_items).toEqual([20, 45]);
  });

  test("a different first project becomes the row's project", () => {
    const row = ideationRow({ quantity_items: [20, 30, 45] });
    const patch = projectListPatch(row, ["p2", "p3"], projects);
    expect(patch.project_id).toBe("p2");
    expect(patch.quantity_items).toEqual([30, 45]);
  });

  test("clearing every project leaves a one-unit row with no times and keeps the client", () => {
    const patch = projectListPatch(ideationRow({ quantity_items: [20, 30, 45] }), [], projects);
    expect(patch).toEqual({
      project_ids: [],
      project_id: null,
      quantity: 1,
      quantity_items: [],
    });
  });

  test("a legacy row's one project keeps its time when more are ticked", () => {
    const legacy = ideationRow({ project_ids: undefined, quantity: 1, quantity_items: [25] });
    expect(projectListPatch(legacy, ["p1", "p2"], projects).quantity_items).toEqual([25, null]);
  });
});
