import { chartBars, chartTicks } from "./monthlyChart";

const monthly = [
  { month: "2026-08", active: 136, on_track: 100, delayed: 26, due_soon: 10 },
  { month: "2026-09", active: 142, on_track: 80, delayed: 40, due_soon: 22 },
];

test("ticks round the tallest bar up so it fits", () => {
  expect(chartTicks(monthly)).toEqual({ top: 150, ticks: [150, 75, 0] });
  expect(chartTicks([]).top).toBe(1);
  expect(chartTicks([{ active: 7 }]).ticks).toEqual([7, 4, 0]);
});

test("each bar carries its split, tooltip and current flag", () => {
  const [aug, sep] = chartBars(monthly, "2026-09");
  expect(aug.current).toBe(false);
  expect(sep.current).toBe(true);
  expect(sep.total).toBe(142);
  expect(sep.tip).toBe("Sep · 142 active · 80 on track · 40 delayed · 22 due soon");
  expect(parseFloat(sep.onH)).toBeCloseTo((80 / 150) * 100);
});
