import { ArrowRight } from "lucide-react";
import { chartBars, chartTicks } from "@/lib/monthlyChart";
import { C, CARD, EYEBROW } from "./dashboardTheme";

// "At a glance, last 12 months": one bar per month, sized by active deliverables.
export function MonthlyChart({ monthly, month, setMonth, critCount, openActions }) {
  if (!monthly || monthly.length === 0) return null;
  const bars = chartBars(monthly, month);
  const { ticks } = chartTicks(monthly);
  return (
    <section aria-label="Month-wise overview" className={`${CARD} flex flex-col gap-4 p-5`} data-testid="monthly-chart">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
          <span className={EYEBROW}>At a glance · last 12 months</span>
          <span className="text-[13px] text-[rgb(84,100,144)]">Bar height = deliverables in the month</span>
        </div>
        <span className="flex gap-3.5 text-[12px] text-[rgb(74,88,120)]">
          {[["Started in the month", C.brand500], ["Spilled over", C.warning500]].map(([name, color]) => (
            <span key={name} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
              {name}
            </span>
          ))}
        </span>
        <button
          type="button"
          onClick={() => openActions(critCount ? "crit" : "all")}
          className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[rgb(43,43,181)] px-3.5 text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-[rgb(61,61,204)]"
        >
          {critCount ? `Review ${critCount} critical action${critCount === 1 ? "" : "s"}` : "Review actions"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="flex min-w-0 gap-2">
        <div className="flex flex-col pb-[22px] pt-6 text-right text-[11px] tabular-nums text-[rgb(138,151,181)]">
          <div className="flex h-[160px] flex-col justify-between">
            {ticks.map((t, i) => (
              <span key={i} className="leading-none">{t}</span>
            ))}
          </div>
        </div>
        <div role="list" className="grid min-w-0 flex-1 grid-cols-12 gap-1.5">
          {bars.map((b) => (
            <button
              key={b.month}
              type="button"
              role="listitem"
              title={b.tip}
              aria-pressed={b.current}
              onClick={() => setMonth(b.month)}
              className="flex min-w-0 flex-col items-center gap-1.5 bg-transparent p-0"
            >
              <span className={`text-[12px] tabular-nums ${b.current ? "font-bold text-[rgb(13,27,62)]" : "text-[rgb(84,100,144)]"}`}>{b.total}</span>
              <span
                className={`flex h-[160px] w-full max-w-[44px] flex-col justify-end shadow-[inset_0_-1px_0_rgb(234,238,244)] transition-opacity duration-100 ${b.current ? "" : "opacity-50 hover:opacity-100"}`}
              >
                <span className="rounded-t-sm" style={{ height: b.spilledH, background: C.warning500 }} />
                <span style={{ height: b.freshH, background: C.brand500 }} />
              </span>
              <span className={`text-[12px] ${b.current ? "font-bold text-[rgb(13,27,62)]" : "text-[rgb(84,100,144)]"}`}>{b.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
