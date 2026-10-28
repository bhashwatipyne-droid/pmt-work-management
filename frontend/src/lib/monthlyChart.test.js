import { chartBars, chartTicks } from "./monthlyChart";

const monthly = [
  { month: "2026-08", total: 136, active: 136, on_track: 100, delayed: 26, at_risk: 10 },
  { month: "2026-09", total: 142, active: 142, on_track: 80, delayed: 40, at_risk: 22 },
];

test("ticks round the tallest bar up so it fits", () => {
  expect(chartTicks(monthly)).toEqual({ top: 150, ticks: [150, 75, 0] });
  expect(chartTicks([]).top).toBe(1);
  expect(chartTicks([{ total: 7 }]).ticks).toEqual([7, 4, 0]);
});

test("each bar carries its height, tooltip and current flag", () => {
  const [aug, sep] = chartBars(monthly, "2026-09");
  expect(aug.current).toBe(false);
  expect(sep.current).toBe(true);
  expect(sep.total).toBe(142);
  expect(sep.tip).toBe("Sep · 142 deliverables");
  expect(parseFloat(sep.h)).toBeCloseTo((142 / 150) * 100);
});
