import { computePlan, taskFromRow } from "./planningLogic";
import { P_TASKS } from "./seed";
import { toPeopleRows } from "@/services/planningApi";

// What /api/planning/overview returns for a Friday afternoon.
const ctx = {
  date: "2026-10-09",
  days: ["Mon 5", "Tue 6", "Wed 7", "Thu 8", "Fri 9"],
  today: 4,
  now: 13.5,
  hours_per_day: 8.5,
  week_label: "Mon 5 – Fri 9 Oct",
  today_label: "Friday, 9 Oct",
};
const apiPeople = [
  { id: "u1", name: "Ratnesh Bor", dept: "Content" },
  { id: "u2", name: "New Joiner", dept: "Content" },
];
const apiTasks = [
  { id: "t-1", who: "Ratnesh Bor", task: "Investing blog", proj: "Contra", d0: 4, d1: 4, est: 1, cat: "new", note: "Assigned today", sh: 9.5, status: "todo" },
  { id: "t-2", who: "Ratnesh Bor", task: "Old script", proj: "Contra", d0: 2, d1: 4, est: 2, cat: "rolled", note: "From Wed · 2d late", sh: 10.5, status: "wip" },
  { id: "t-3", who: "Someone Else", task: "Not in the team list", proj: "X", d0: 4, d1: 4, est: 1, cat: "new", note: "", sh: 9.5, status: "todo" },
];

test("seed rows still compute with the defaults (no backend context)", () => {
  const plan = computePlan(P_TASKS.map(taskFromRow), { period: "today" });
  expect(plan.periodLabel).toBe("Thursday, 8 Oct");
  expect(plan.rows.length).toBe(10);
});

test("computes from API people and context", () => {
  const people = toPeopleRows(apiPeople);
  const plan = computePlan(apiTasks, { period: "today", people, ctx });

  expect(plan.periodLabel).toBe("Friday, 9 Oct");
  expect(computePlan(apiTasks, { period: "week", people, ctx }).periodLabel).toBe("Mon 5 – Fri 9 Oct");
  expect(plan.rows.map((r) => r.name)).toEqual(["Ratnesh Bor", "New Joiner"]);

  const ratnesh = plan.rows[0];
  // 1h (new) + 2h over d0..d1 = 3 days -> 0.67h today: only things scheduled today count
  expect(ratnesh.bars.map((b) => b.id).sort()).toEqual(["t-1", "t-2"]);
  expect(ratnesh.loadTxt).toMatch(/of 8h 30m/);

  // a task whose assignee is not in the people list is not drawn
  expect(plan.list.find((l) => l.id === "t-3")).toBeUndefined();
  expect(plan.list.find((l) => l.id === "t-1").who).toBe("Ratnesh Bor");
});

test("people without seed stats get neutral stats and trigger no fake 'hold new work' advice", () => {
  const rows = toPeopleRows(apiPeople);
  const joiner = rows.find((r) => r[0] === "New Joiner");
  expect(joiner.slice(2, 5)).toEqual([80, 4, 2]);
  const plan = computePlan(apiTasks, { period: "today", people: rows, ctx });
  expect(plan.insights.some((i) => i.title.startsWith("Hold new work"))).toBe(false);
});

test("a reassign suggestion carries the task id (a string id from the API)", () => {
  const people = toPeopleRows([
    { id: "u1", name: "Ratnesh Bor", dept: "Content" },
    { id: "u2", name: "Milind Tandi", dept: "Content" },
  ]);
  const heavy = ["a", "b", "c"].map((k) => ({ id: "t-" + k, who: "Ratnesh Bor", task: "Job " + k, proj: "P", d0: 4, d1: 4, est: 4, cat: "new", note: "", sh: 9.5, status: "todo" }));
  const plan = computePlan(heavy, { period: "today", people, ctx });
  const move = plan.insights.find((i) => i.act?.type === "reassign");
  expect(move.act).toMatchObject({ to: "Milind Tandi", from: "Ratnesh Bor" });
  expect(typeof move.act.taskId).toBe("string");
});

test("work the person typed into their own Work Sheet is drawn but never suggested for reassignment", () => {
  const people = toPeopleRows([
    { id: "u1", name: "Ratnesh Bor", dept: "Content" },
    { id: "u2", name: "Milind Tandi", dept: "Content" },
  ]);
  const job = (k, extra = {}) => ({ id: "t-" + k, who: "Ratnesh Bor", task: "Job " + k, proj: "P", d0: 4, d1: 4, est: 4, cat: "new", note: "", sh: 9.5, status: "todo", ...extra });
  const typed = ["a", "b", "c"].map((k) => job(k, { src: "worksheet", note: "Logged today" }));

  const plan = computePlan(typed, { period: "today", people, ctx });
  expect(plan.rows[0].bars).toHaveLength(3);
  expect(plan.insights.find((i) => i.act?.type === "reassign")).toBeUndefined();

  // one WhatsApp task among them can still be moved
  const mixed = [...typed, job("w")];
  const move = computePlan(mixed, { period: "today", people, ctx }).insights.find((i) => i.act?.type === "reassign");
  expect(move.act.taskId).toBe("t-w");
});
