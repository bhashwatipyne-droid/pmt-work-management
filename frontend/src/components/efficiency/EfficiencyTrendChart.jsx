import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { monthLabel } from "./EfficiencyFilters";

export const EfficiencyTrendChart = ({ data = [] }) => {
  const rows = data.map((d) => ({
    ...d,
    label: monthLabel(d.month).replace(/ \d{4}$/, ""),
  }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Productivity trend</h3>
        <p className="text-xs text-slate-500">
          Team productivity against core and non-core hours
        </p>
      </div>

      <div className="h-64 p-4">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            No trend data yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="hours" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="pct"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="hours" dataKey="core_hours" name="Core hours" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="hours" dataKey="non_core_hours" name="Non-core hours" fill="#fde68a" radius={[4, 4, 0, 0]} />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="team_productivity"
                name="Productivity %"
                stroke="#2b2bb5"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};