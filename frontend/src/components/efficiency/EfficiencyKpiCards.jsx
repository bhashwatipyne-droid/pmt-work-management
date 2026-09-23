export const fmtPct = (v) => `${Number(v ?? 0).toFixed(2)}%`;
export const fmtHours = (v) => `${Number(v ?? 0).toFixed(1)}h`;

// The redesign's KPI cards are flat (label / big value / one line of sub
// text) with no icon, sparkline, or trend badge — a real simplification,
// not just a restyle. Rather than silently drop the trend deltas the old
// cards showed visually, they're folded into the sub-text itself here
// (e.g. "vs last month · +2.3%"), colored to match, so that information
// isn't lost even though the sparkline/ring visuals are.
const Card = ({ label, value, sub, subColor = "#64748b" }) => (
  <div className="flex flex-col gap-1.5 rounded-xl bg-white p-3.5 shadow-[inset_0_0_0_1px_rgba(234,238,244,1)]">
    <span className="text-xs text-slate-500">{label}</span>
    <span className="text-[26px] font-bold leading-none tracking-tight text-slate-900">
      {value}
    </span>
    <span className="text-xs" style={{ color: subColor }}>
      {sub}
    </span>
  </div>
);

const deltaSuffix = (delta) => {
  if (typeof delta !== "number" || delta === 0) return "";
  const arrow = delta > 0 ? "↑" : "↓";
  return ` · ${arrow} ${Math.abs(delta).toFixed(1)}%`;
};

const deltaColor = (delta) => {
  if (typeof delta !== "number" || delta === 0) return "#64748b";
  return delta > 0 ? "#059669" : "#e11d48";
};

export const EfficiencyKpiCards = ({ kpis, trend = [] }) => {
  if (!kpis) return null;

  const employeesTotal = kpis.employees_total ?? 0;
  const employeesTracked = kpis.employees_tracked ?? 0;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
      <Card
        label="Team productivity"
        value={fmtPct(kpis.team_productivity)}
        sub={`vs last month${deltaSuffix(kpis.team_productivity_delta)}`}
        subColor={deltaColor(kpis.team_productivity_delta)}
      />
      <Card
        label="Core hours"
        value={fmtHours(kpis.total_core_hours)}
        sub="Available capacity"
      />
      <Card
        label="Non-core hours"
        value={fmtHours(kpis.total_non_core_hours)}
        sub="Logged time"
      />
      <Card
        label="Closed deliverables"
        value={kpis.closed_deliverables ?? 0}
        sub="This month"
      />
      <Card
        label="Employees tracked"
        value={`${employeesTracked} / ${employeesTotal}`}
        sub="With capacity set"
      />
    </div>
  );
};