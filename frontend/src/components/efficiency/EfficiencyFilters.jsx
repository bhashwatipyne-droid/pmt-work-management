import { ChevronLeft, ChevronRight } from "lucide-react";

export const currentMonth = () => new Date().toISOString().slice(0, 7);

export const shiftMonth = (month, delta) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

export const monthLabel = (month) => {
  if (!month) return "";
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

export const monthOptions = (count = 14) => {
  const base = currentMonth();
  return Array.from({ length: count }, (_, i) => shiftMonth(base, -i));
};

const selectClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 " +
  "focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/20";

export const EfficiencyFilters = ({
  month,
  onMonthChange,
  department,
  onDepartmentChange,
  departments = [],
  employee,
  onEmployeeChange,
  employees = [],
  right = null,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => onMonthChange(shiftMonth(month, -1))}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <select
        value={month}
        onChange={(e) => onMonthChange(e.target.value)}
        className={`${selectClass} min-w-[150px] font-medium`}
        data-testid="efficiency-month-select"
      >
        {monthOptions().map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>

      <button
        type="button"
        aria-label="Next month"
        onClick={() => onMonthChange(shiftMonth(month, 1))}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>

    {onDepartmentChange && (
      <select
        value={department || ""}
        onChange={(e) => onDepartmentChange(e.target.value)}
        className={selectClass}
        data-testid="efficiency-department-select"
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
    )}

    {onEmployeeChange && (
      <select
        value={employee || ""}
        onChange={(e) => onEmployeeChange(e.target.value)}
        className={selectClass}
        data-testid="efficiency-employee-select"
      >
        <option value="">All employees</option>
        {employees.map((e) => (
          <option key={e.user_id || e.id} value={e.user_id || e.id}>
            {e.name}
          </option>
        ))}
      </select>
    )}

    {right && <div className="ml-auto flex items-center gap-2">{right}</div>}
  </div>
);