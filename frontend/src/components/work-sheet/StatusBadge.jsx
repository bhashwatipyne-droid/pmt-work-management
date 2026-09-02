const STATUS_STYLES = {
  "Not Started": "bg-slate-100 text-slate-600 border-slate-200",
  Ongoing: "bg-amber-100 text-amber-700 border-amber-300",
  "Ready for Review": "bg-blue-100 text-blue-700 border-blue-300",
  "Changes Requested": "bg-rose-100 text-rose-700 border-rose-300",
  Closed: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

export const StatusBadge = ({ status }) => (
  <span
    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${
      STATUS_STYLES[status] || STATUS_STYLES["Not Started"]
    }`}
  >
    {status}
  </span>
);
