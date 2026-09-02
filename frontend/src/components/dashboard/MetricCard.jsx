const ACCENTS = {
  teal: "bg-teal-50 text-teal-700 border-teal-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
};

export const MetricCard = ({ label, value, sublabel, accent = "teal", icon: Icon, testId }) => (
  <div data-testid={testId} className={`rounded-xl border p-4 shadow-sm ${ACCENTS[accent]}`}>
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</span>
      {Icon && <Icon className="h-4 w-4 opacity-60" />}
    </div>
    <div className="mt-2 text-3xl font-bold">{value}</div>
    {sublabel && <div className="mt-1 text-xs opacity-70">{sublabel}</div>}
  </div>
);
