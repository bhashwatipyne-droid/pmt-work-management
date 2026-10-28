// Bars for the Home "last 12 months" chart. Pure, so it can be tested.
import { monthShort } from "@/lib/homeDashboard";

// Axis ticks: 0, half, and the top, rounded up so the tallest bar always fits.
export function chartTicks(monthly) {
  const max = Math.max(1, ...(monthly || []).map((m) => m.total || 0));
  const top = max <= 10 ? max : Math.ceil(max / 10) * 10;
  return { top, ticks: [top, Math.round(top / 2), 0] };
}

export function chartBars(monthly, currentMonthKey) {
  const { top } = chartTicks(monthly);
  const h = (n) => `${((n || 0) / top) * 100}%`;
  return (monthly || []).map((m) => ({
    month: m.month,
    label: monthShort(m.month),
    total: m.total || 0,
    current: m.month === currentMonthKey,
    h: h(m.total),
    tip: `${monthShort(m.month)} · ${m.total || 0} deliverables`,
  }));
}
