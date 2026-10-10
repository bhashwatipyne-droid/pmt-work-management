import { computeFrozenLefts, frozenStyle } from "./worksheetFreeze";

const visible = ["Date", "Client", "Project", "Deliverable"];

test("nothing is frozen until a column is chosen", () => {
  expect(computeFrozenLefts(visible, null)).toBeNull();
  expect(computeFrozenLefts(visible, "Qty")).toBeNull(); // a hidden / unknown column
});

test("each frozen column sticks right after the gutter and the columns before it", () => {
  const lefts = computeFrozenLefts(visible, "Project", {}, 2000);
  // gutter = 26 + 34; Date 130, Client 150
  expect(lefts).toEqual({
    Date: { left: 60, last: false },
    Client: { left: 190, last: false },
    Project: { left: 340, last: true },
  });
});

test("a resized column moves the ones after it", () => {
  const lefts = computeFrozenLefts(visible, "Client", { Date: "200px" }, 2000);
  expect(lefts.Client.left).toBe(260);
});

test("freezing so much that little of the screen is left to scroll is refused", () => {
  expect(computeFrozenLefts(visible, "Deliverable", {}, 800)).toBeNull();
});

test("only frozen columns get pinned, and the last one has a divider", () => {
  const lefts = computeFrozenLefts(visible, "Client", {}, 2000);
  expect(frozenStyle(lefts, "Deliverable")).toBeUndefined();
  expect(frozenStyle(lefts, "Date")).toEqual({ position: "sticky", left: 60, zIndex: 15 });
  expect(frozenStyle(lefts, "Client", 36)).toMatchObject({ position: "sticky", left: 190, zIndex: 36 });
  expect(frozenStyle(lefts, "Client").boxShadow).toBeDefined();
  expect(frozenStyle(null, "Date")).toBeUndefined();
});
