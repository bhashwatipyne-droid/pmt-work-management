export const ProjectMetricCard = ({ label, value, testId }) => (
  <div
    data-testid={testId}
    className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
  >
    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
    <div className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</div>
  </div>
);
