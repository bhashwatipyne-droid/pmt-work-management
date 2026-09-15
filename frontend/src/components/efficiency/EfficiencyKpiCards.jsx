import { TrendingDown, TrendingUp, Clock, CheckCircle2, Users, Gauge } from "lucide-react";
import { LineChart, Line, BarChart, Bar, ResponsiveContainer } from "recharts";

export const fmtPct = (v) => `${Number(v ?? 0).toFixed(2)}%`;
export const fmtHours = (v) => `${Number(v ?? 0).toFixed(1)}h`;

const Sparkline = ({ data, dataKey, color }) => {
  if (!data || data.length < 2) return <div className="h-8 w-20" />;
  return (
    <div className="h-8 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const MiniBars = ({ data, dataKey, color }) => {
  if (!data || data.length < 2) return <div className="h-8 w-20" />;
  return (
    <div className="h-8 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <Bar dataKey={dataKey} fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const Ring = ({ percent, color = "#2b2bb5" }) => {
  const r = 18;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, percent));
  const offset = c - (pct / 100) * c;

  return (
    <svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={r} fill="none" stroke="#eef2f7" strokeWidth="6" />
      <circle
        cx="24"
        cy="24"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
      />
      <text x="24" y="28" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">
        {Math.round(pct)}%
      </text>
    </svg>
  );
};

const iconTones = {
  indigo: "bg-indigo-50 text-indigo-600",
  teal: "bg-teal-50 text-teal-600",
  amber: "bg-amber-50 text-amber-600",
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
};

const Card = ({ label, value, sublabel, icon: Icon, tone = "indigo", trend, right }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconTones[tone]}`}>
          {Icon && <Icon className="h-4 w-4" />}
        </span>
        <span className="text-sm font-medium text-slate-600">{label}</span>
      </div>

      {typeof trend === "number" && trend !== 0 && (
        <span
          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
            trend > 0 ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
          }`}
        >
          {trend > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {Math.abs(trend).toFixed(1)}%
        </span>
      )}
    </div>

    <div className="mt-3 flex items-end justify-between gap-2">
      <div>
        <div className="text-[26px] font-bold leading-none tracking-tight text-slate-900">
          {value}
        </div>
        {sublabel && <div className="mt-1.5 text-xs text-slate-400">{sublabel}</div>}
      </div>
      {right}
    </div>
  </div>
);

export const EfficiencyKpiCards = ({ kpis, trend = [] }) => {
  if (!kpis) return null;

  const employeesTotal = kpis.employees_total ?? 0;
  const employeesTracked = kpis.employees_tracked ?? 0;
  const trackedPct = employeesTotal ? (employeesTracked / employeesTotal) * 100 : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Card
        label="Team productivity"
        value={fmtPct(kpis.team_productivity)}
        trend={kpis.team_productivity_delta}
        sublabel="vs last month"
        icon={Gauge}
        tone="indigo"
        right={<Sparkline data={trend} dataKey="team_productivity" color="#2b2bb5" />}
      />
      <Card
        label="Core hours"
        value={fmtHours(kpis.total_core_hours)}
        sublabel="Available capacity"
        icon={Clock}
        tone="teal"
        right={<Sparkline data={trend} dataKey="core_hours" color="#0d9488" />}
      />
      <Card
        label="Non-core hours"
        value={fmtHours(kpis.total_non_core_hours)}
        sublabel="Logged time"
        icon={Clock}
        tone="amber"
        right={<Sparkline data={trend} dataKey="non_core_hours" color="#d97706" />}
      />
      <Card
        label="Closed deliverables"
        value={kpis.closed_deliverables ?? 0}
        sublabel="This month"
        icon={CheckCircle2}
        tone="blue"
        right={<MiniBars data={trend} dataKey="closed_deliverables" color="#3b82f6" />}
      />
      <Card
        label="Employees tracked"
        value={`${employeesTracked} / ${employeesTotal}`}
        sublabel="With capacity set"
        icon={Users}
        tone="violet"
        right={<Ring percent={trackedPct} color="#7c3aed" />}
      />
    </div>
  );
};