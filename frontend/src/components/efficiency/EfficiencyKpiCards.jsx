import { TrendingDown, TrendingUp, Clock, CalendarDays, CheckCircle2, Users } from "lucide-react";

export const fmtPct = (v) => `${Number(v ?? 0).toFixed(2)}%`;
export const fmtHours = (v) => `${Number(v ?? 0).toFixed(1)}h`;

const Card = ({ label, value, sublabel, icon: Icon, tone = "slate", trend }) => {
  const tones = {
    slate: "border-slate-200 bg-white text-slate-900",
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    teal: "border-teal-200 bg-teal-50 text-teal-900",
  };

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide opacity-60">
          {label}
        </span>
        {Icon && <Icon className="h-4 w-4 opacity-50" />}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>

        {typeof trend === "number" && trend !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-medium ${
              trend > 0 ? "text-emerald-600" : "text-rose-600"
            }`}
          >
            {trend > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>

      {sublabel && <div className="mt-1 text-xs opacity-60">{sublabel}</div>}
    </div>
  );
};

export const EfficiencyKpiCards = ({ kpis }) => {
  if (!kpis) return null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <Card
        label="Team productivity"
        value={fmtPct(kpis.team_productivity)}
        trend={kpis.team_productivity_delta}
        sublabel="vs last month"
        tone="indigo"
      />
      <Card
        label="Core hours"
        value={fmtHours(kpis.total_core_hours)}
        sublabel="Available capacity"
        icon={Clock}
        tone="teal"
      />
      <Card
        label="Non-core hours"
        value={fmtHours(kpis.total_non_core_hours)}
        sublabel="Logged time"
        icon={Clock}
        tone="amber"
      />
      <Card
        label="Avg core days"
        value={Number(kpis.average_core_days ?? 0).toFixed(2)}
        sublabel="Per employee"
        icon={CalendarDays}
      />
      <Card
        label="Closed deliverables"
        value={kpis.closed_deliverables ?? 0}
        sublabel="Core, this month"
        icon={CheckCircle2}
      />
      <Card
        label="Employees tracked"
        value={`${kpis.employees_tracked ?? 0}/${kpis.employees_total ?? 0}`}
        sublabel="With capacity set"
        icon={Users}
      />
    </div>
  );
};