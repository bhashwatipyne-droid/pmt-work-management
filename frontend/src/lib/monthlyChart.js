// Bars for the Home "last 12 months" chart. Pure, so it can be tested.
import { monthShort } from "@/lib/homeDashboard";

// Axis ticks: 0, half, and the top, rounded up so the tallest bar always fits.
export function chartTicks(monthly) {
  const max = Math.max(1, ...(monthly || []).map((m) => m.active || 0));
  const top = max <= 10 ? max : Math.ceil(max / 10) * 10;
  return { top, ticks: [top, Math.round(top / 2), 0] };
}

export function chartBars(monthly, currentMonthKey) {
  const { top } = chartTicks(monthly);
  const h = (n) => `${((n || 0) / top) * 100}%`;
  return (monthly || []).map((m) => ({
    month: m.month,
    label: monthShort(m.month),
    total: m.active || 0,
    current: m.month === currentMonthKey,
    onH: h(m.on_track),
    delayedH: h(m.delayed),
    soonH: h(m.due_soon),
    tip: `${monthShort(m.month)} · ${m.active} active · ${m.on_track} on track · ${m.delayed} delayed · ${m.due_soon} due soon`,
  }));
}
