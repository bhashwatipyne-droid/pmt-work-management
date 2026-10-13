import {
  deliverableIdsOf,
  deliverableListPatch,
  isMultiDeliverableRow,
  isQtySet,
  loggedCount,
  qtyApplies,
  quantityOf,
  unitName,
} from "./quantity";
import { matchesDeliverableFilter } from "./worksheetFilterOptions";

const PEER = "Campaign Ideation Plan (Content Peer Analysis)";

const ideationRow = (extra = {}) => ({
  id: "row-1",
  stage: "Content",
  deliverable_type: PEER,
  project_id: "p1",
  deliverable_id: "d1",
  deliverable_ids: ["d1", "d2", "d3"],
  quantity: 3,
  quantity_items: [null, null, null],
  ...extra,
});

describe("multi-deliverable (Campaign Ideation Plan) rows", () => {
  test("every Campaign Ideation Plan type on a Content row covers several deliverables", () => {
    [
      "Campaign Ideation Plan (Includes Keywords)",
      "Campaign Ideation Plan (Quantitative Analysis)",
      PEER,
      "Campaign Ideation Plan (Key Visuals / Taglines)",
    ].forEach((deliverable_type) => {
      expect(isMultiDeliverableRow(ideationRow({ deliverable_type }))).toBe(true);
    });
  });

  test("other types and other stages do not", () => {
    expect(isMultiDeliverableRow(ideationRow({ deliverable_type: "Carousel" }))).toBe(false);
    // The meeting type is Non-Core and starts differently.
    expect(isMultiDeliverableRow(ideationRow({ deliverable_type: "Campaign Ideation Discussions" }))).toBe(false);
    expect(isMultiDeliverableRow(ideationRow({ stage: "Design" }))).toBe(false);
    expect(isMultiDeliverableRow(ideationRow({ stage: null }))).toBe(false);
  });

  test("Qty applies, and the quantity is the number of ticked deliverables", () => {
    const row = ideationRow();
    expect(qtyApplies(row)).toBe(true);
    expect(quantityOf(row)).toBe(3);
    expect(isQtySet(row)).toBe(true);
    expect(unitName(row, {}, 3)).toBe("deliverables");
    expect(unitName(row, {}, 1)).toBe("deliverable");
  });

  test("ten ticked deliverables make the quantity ten", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `d${i + 1}`);
    expect(quantityOf(ideationRow({ deliverable_ids: ids, quantity: 1 }))).toBe(10);
  });

  test("a stale stored quantity never wins over the deliverable list", () => {
    expect(quantityOf(ideationRow({ quantity: 1 }))).toBe(3);
  });

  test("a row saved before the list existed covers its one deliverable", () => {
    const legacy = ideationRow({ deliverable_ids: undefined, quantity: 1, quantity_items: [] });
    expect(deliverableIdsOf(legacy)).toEqual(["d1"]);
    expect(quantityOf(legacy)).toBe(1);
    expect(isQtySet(legacy)).toBe(true);
  });

  test("no deliverable yet: nothing to count, Qty is not set", () => {
    const empty = ideationRow({ deliverable_id: null, deliverable_ids: [], quantity: 1, quantity_items: [] });
    expect(qtyApplies(empty)).toBe(true);
    expect(isQtySet(empty)).toBe(false);
    expect(quantityOf(empty)).toBe(1);
  });

  test("logged count follows the times typed for each deliverable", () => {
    expect(loggedCount(ideationRow({ quantity_items: [20, null, 45] }))).toBe(2);
  });

  test("a Non-Core Content row has no quantity", () => {
    const plain = {
      stage: "Content",
      deliverable_type: "Project Briefing",
      work_category: "Non-Core",
      deliverable_id: "d1",
    };
    expect(qtyApplies(plain)).toBe(false);
    expect(isQtySet(plain)).toBe(false);
  });

  test("the deliverable filter finds a row by any of its deliverables", () => {
    const row = ideationRow();
    expect(matchesDeliverableFilter(row, new Set(["d3"]))).toBe(true);
    expect(matchesDeliverableFilter(row, new Set(["d9"]))).toBe(false);
  });
});

describe("Content rows on Core deliverable types", () => {
  const ppt = (extra = {}) => ({
    id: "row-2",
    stage: "Content",
    deliverable_type: "Presentation (PPT) - Per Slide",
    work_category: "Core",
    quantity: 1,
    quantity_items: [],
    ...extra,
  });

  test("Qty applies, like it does on a Design row", () => {
    expect(qtyApplies(ppt())).toBe(true);
    expect(qtyApplies({ stage: "Design", deliverable_type: "Carousel" })).toBe(true);
  });

  test("a typed quantity counts, with one time slot per unit", () => {
    const row = ppt({ quantity: 12, quantity_items: Array(12).fill(null) });
    expect(isQtySet(row)).toBe(true);
    expect(quantityOf(row)).toBe(12);
  });

  test("a default row shows no count yet", () => {
    expect(isQtySet(ppt())).toBe(false);
  });

  test("the unit is named after the type", () => {
    const options = { deliverable_type_units: { "Presentation (PPT) - Per Slide": "Slide" } };
    expect(unitName(ppt(), options, 1)).toBe("slide");
    expect(unitName(ppt(), options, 12)).toBe("slides");
  });

  test("Non-Core activities, a missing type and other stages stay out", () => {
    expect(qtyApplies(ppt({ deliverable_type: "Hiring and Interviews", work_category: "Non-Core" }))).toBe(false);
    expect(qtyApplies(ppt({ deliverable_type: "" }))).toBe(false);
    expect(qtyApplies(ppt({ stage: "Review" }))).toBe(false);
  });

  test("Campaign Ideation Plan keeps its own rule: quantity follows the ticked deliverables", () => {
    const row = ideationRow({ work_category: "Core", quantity: 9 });
    expect(isMultiDeliverableRow(row)).toBe(true);
    expect(quantityOf(row)).toBe(3);
  });
});

describe("deliverableListPatch", () => {
  test("ticking a deliverable adds a unit with no time and keeps the others' times", () => {
    const row = ideationRow({ quantity_items: [20, null, 45] });
    expect(deliverableListPatch(row, ["d1", "d2", "d3", "d4"])).toEqual({
      deliverable_ids: ["d1", "d2", "d3", "d4"],
      deliverable_id: "d1",
      deliverable_not_available: false,
      quantity: 4,
      quantity_items: [20, null, 45, null],
    });
  });

  test("unticking a deliverable takes its time with it, not the next one's", () => {
    const row = ideationRow({ quantity_items: [20, 30, 45] });
    const patch = deliverableListPatch(row, ["d1", "d3"]);
    expect(patch.quantity).toBe(2);
    expect(patch.quantity_items).toEqual([20, 45]);
  });

  test("a different first deliverable becomes the row's deliverable", () => {
    const row = ideationRow({ quantity_items: [20, 30, 45] });
    const patch = deliverableListPatch(row, ["d2", "d3"]);
    expect(patch.deliverable_id).toBe("d2");
    expect(patch.quantity_items).toEqual([30, 45]);
  });

  test("unticking everything leaves a one-unit row with no times", () => {
    const patch = deliverableListPatch(ideationRow({ quantity_items: [20, 30, 45] }), []);
    expect(patch).toEqual({
      deliverable_ids: [],
      deliverable_id: null,
      deliverable_not_available: false,
      quantity: 1,
      quantity_items: [],
    });
  });

  test("a legacy row's one deliverable keeps its time when more are ticked", () => {
    const legacy = ideationRow({ deliverable_ids: undefined, quantity: 1, quantity_items: [25] });
    expect(deliverableListPatch(legacy, ["d1", "d2"]).quantity_items).toEqual([25, null]);
  });
});
