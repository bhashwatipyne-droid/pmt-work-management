import { taskAlertText, unseenIds } from "./taskAlert";

test("only cards that were not alerted about yet count as new", () => {
  const seen = new Set(["a", "b"]);
  expect(unseenIds(["a", "b", "c"], seen)).toEqual(["c"]);
  expect(unseenIds(["a"], seen)).toEqual([]);
  expect(unseenIds(["x", "y"], new Set())).toEqual(["x", "y"]);
});

test("the alert text is singular for one task", () => {
  expect(taskAlertText(1)).toBe("1 task is waiting for you");
  expect(taskAlertText(3)).toBe("3 tasks are waiting for you");
});
