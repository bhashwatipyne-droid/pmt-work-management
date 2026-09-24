import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Settings2,
  Info,
  CalendarDays,
  Clock,
  Hourglass,
  Target,
  CalendarCheck2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  getEfficiencyOverview,
  getMonthlyCapacityList,
  saveMonthlyCapacity,
} from "@/services/api";

import {
  currentMonth,
  monthOptions,
  monthLabel,
  shiftMonth,
} from "@/components/efficiency/EfficiencyFilters";
import { fmtHours } from "@/components/efficiency/EfficiencyKpiCards";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { SettingsTableSkeleton } from "@/components/skeletons/Skeletons";

const DEFAULT_HOURS_PER_DAY = 8.5;

const fieldClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 " +
  "focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-9 text-sm text-slate-900 " +
  "focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const iconTones = {
  blue: "bg-blue-50 text-blue-600",
  violet: "bg-violet-50 text-violet-600",
  teal: "bg-teal-50 text-teal-600",
  emerald: "bg-emerald-50 text-emerald-600",
};

const Calc = ({ icon: Icon, tone = "blue", label, value, sublabel }) => (
  <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
    <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${iconTones[tone]}`}>
      <Icon className="h-4 w-4" />
    </span>
    <div className="min-w-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-slate-900">{value}</div>
      {sublabel && <div className="mt-0.5 text-[11px] text-slate-400">{sublabel}</div>}
    </div>
  </div>
);

export default function EfficiencyMonthlyCapacityPage() {
  const { currentUser, loading: userLoading } = useUser();

  const [month, setMonth] = useState(currentMonth());
  const [employeeId, setEmployeeId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [capacities, setCapacities] = useState([]);
  const [search, setSearch] = useState("");

  const [workingDays, setWorkingDays] = useState("");
  const [leaveDays, setLeaveDays] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(DEFAULT_HOURS_PER_DAY);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingNext, setSavingNext] = useState(false);

  // Manager-only: admins and members can read Efficiency but not edit capacity.
  const canConfigure = currentUser?.role === "manager";

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([getEfficiencyOverview(month), getMonthlyCapacityList({ month })])
      .then(([overview, caps]) => {
        if (cancelled) return;
        setEmployees(overview.employees || []);
        setCapacities(caps || []);
        setEmployeeId((prev) => prev || overview.employees?.[0]?.user_id || "");
      })
      .catch(() => !cancelled && toast.error("Could not load employees for this month"))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => load(), [load]);

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.trim().toLowerCase();
    return employees.filter((e) => e.name?.toLowerCase().includes(q));
  }, [employees, search]);

  const missingCount = useMemo(
    () => employees.filter((e) => !capacities.some((c) => c.user_id === e.user_id)).length,
    [employees, capacities]
  );

  const selectedRow = useMemo(
    () => employees.find((e) => e.user_id === employeeId),
    [employees, employeeId]
  );

  const existingCapacity = useMemo(
    () => capacities.find((c) => c.user_id === employeeId),
    [capacities, employeeId]
  );

  // Reset the form whenever the target employee or month changes.
  useEffect(() => {
    setWorkingDays(existingCapacity ? String(existingCapacity.working_days) : "");
    setLeaveDays(existingCapacity ? String(existingCapacity.leave_days) : "");
    setHoursPerDay(existingCapacity?.working_hours_per_day || DEFAULT_HOURS_PER_DAY);
  }, [existingCapacity, employeeId, month]);

  const wd = Number(workingDays || 0);
  const ld = Number(leaveDays || 0);
  const hpd = Number(hoursPerDay || 0);

  const afterLeave = Math.max(0, wd - ld);
  const monthlyHours = afterLeave * hpd;
  // Non-core hours are already-logged actuals; they come from the overview row.
  const nonCoreHours = selectedRow?.non_core_hours || 0;
  const coreHours = Math.max(0, monthlyHours - nonCoreHours);
  const coreDays = hpd ? coreHours / hpd : 0;

  const validationError = (() => {
    if (workingDays === "") return "Enter working days";
    if (wd < 0) return "Working days cannot be negative";
    if (wd > 31) return "Working days cannot exceed 31";
    if (ld < 0) return "Leave days cannot be negative";
    if (ld > wd) return "Leave cannot exceed working days";
    if (hpd <= 0) return "Working hours per day must be greater than zero";
    if (monthlyHours < nonCoreHours)
      return "Non-core hours already logged exceed the monthly working hours";
    return null;
  })();

  const doSave = async () => {
    if (validationError || !employeeId) return false;
    try {
      await saveMonthlyCapacity({
        user_id: employeeId,
        month,
        working_days: wd,
        leave_days: ld,
        working_hours_per_day: hpd,
      });
      return true;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save capacity");
      return false;
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const ok = await doSave();
    setSaving(false);
    if (ok) {
      toast.success("Capacity saved");
      load();
    }
  };

  const handleSaveAndNext = async () => {
    setSavingNext(true);
    const ok = await doSave();
    setSavingNext(false);
    if (!ok) return;

    toast.success("Capacity saved");

    const list = filteredEmployees.length ? filteredEmployees : employees;
    const idx = list.findIndex((e) => e.user_id === employeeId);
    const next = idx >= 0 ? list[idx + 1] : null;

    load();
    if (next) {
      setEmployeeId(next.user_id);
    } else {
      toast.message("That was the last employee in this list");
    }
  };

  if (userLoading || !currentUser) return null;

  if (!canConfigure) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Monthly capacity setup is available to managers only
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <Link
        to="/efficiency"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Efficiency
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Monthly capacity</h1>
          <p className="text-sm text-slate-500">
            Configure employee capacity for {monthLabel(month)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(shiftMonth(month, -1))}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={`${fieldClass} min-w-[150px] font-medium`}
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
              onClick={() => setMonth(shiftMonth(month, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {missingCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {missingCount} of {employees.length} employees need capacity settings
            </span>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Settings2 className="h-3.5 w-3.5" />
                How it works?
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-3 text-xs leading-relaxed text-slate-600">
              <p className="mb-1.5 font-semibold text-slate-800">How capacity is calculated</p>
              <p>Working days after leave = Working days − Leave days.</p>
              <p>Monthly working hours = Working days after leave × Working hours/day.</p>
              <p>Non-core hours are pulled automatically from logged non-core work items.</p>
              <p>Core hours = Monthly working hours − Non-core hours, and Core days = Core hours ÷ Working hours/day.</p>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {loading ? (
        <SettingsTableSkeleton columns={6} rows={8} label="Loading monthly capacity" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          {/* Employee list */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="mb-2 text-sm font-semibold text-slate-800">Employees</div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${fieldClass} w-full pl-8`}
                />
              </div>
            </div>
            <div className="max-h-[460px] overflow-y-auto">
              {filteredEmployees.map((e) => {
                const configured = capacities.some((c) => c.user_id === e.user_id);
                const active = e.user_id === employeeId;
                return (
                  <button
                    key={e.user_id}
                    type="button"
                    onClick={() => setEmployeeId(e.user_id)}
                    className={`flex w-full items-center gap-2.5 border-b border-l-2 border-slate-100 px-3.5 py-3 text-left text-sm last:border-0 ${
                      active
                        ? "border-l-[#2b2bb5] bg-[#f0f0fd]"
                        : "border-l-transparent hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-[#1a1a8a] ring-1 ring-slate-200">
                      {(e.name || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-800">{e.name}</span>
                      <span className="block truncate text-xs text-slate-400">
                        {e.department || "—"}
                      </span>
                    </span>
                    <span
                      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        configured
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {configured ? "Set" : "Not set"}
                    </span>
                  </button>
                );
              })}
              {filteredEmployees.length === 0 && (
                <div className="px-4 py-6 text-sm text-slate-500">No employees found.</div>
              )}
            </div>
          </div>

          {/* Form */}
          {!selectedRow ? (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-300 p-10 text-sm text-slate-500">
              Select an employee to configure their capacity.
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">
                    Capacity for {selectedRow.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedRow.department || "—"} · {monthLabel(month)}
                  </p>
                </div>
                <div className="flex max-w-sm items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  Set the number of working days, leave days, and working hours per day. We'll
                  calculate the rest for you.
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-600">Working days</span>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="31"
                      value={workingDays}
                      onChange={(e) => setWorkingDays(e.target.value)}
                      className={inputClass}
                      data-testid="capacity-working-days"
                    />
                    <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-600">Leave days</span>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={leaveDays}
                      onChange={(e) => setLeaveDays(e.target.value)}
                      className={inputClass}
                      data-testid="capacity-leave-days"
                    />
                    <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-slate-600">Working hours per day</span>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={hoursPerDay}
                      onChange={(e) => setHoursPerDay(e.target.value)}
                      className={inputClass}
                      data-testid="capacity-hours-per-day"
                    />
                    <Clock className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  </div>
                </label>
              </div>

              <div className="mt-6">
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Calculated capacity</h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <Calc
                    icon={CalendarDays}
                    tone="blue"
                    label="Working days after leave"
                    value={afterLeave.toFixed(2)}
                    sublabel="Working days − Leave days"
                  />
                  <Calc
                    icon={Clock}
                    tone="blue"
                    label="Monthly working hours"
                    value={fmtHours(monthlyHours)}
                    sublabel={`${afterLeave.toFixed(2)} × ${hpd || 0} hours`}
                  />
                  <Calc
                    icon={Hourglass}
                    tone="violet"
                    label="Non-core hours (logged)"
                    value={fmtHours(nonCoreHours)}
                    sublabel="From team logs"
                  />
                  <Calc
                    icon={Target}
                    tone="teal"
                    label="Core hours"
                    value={fmtHours(coreHours)}
                    sublabel="Available for core activities"
                  />
                  <Calc
                    icon={CalendarCheck2}
                    tone="blue"
                    label="Core days"
                    value={coreDays.toFixed(2)}
                    sublabel="Based on core hours"
                  />
                  <Calc
                    icon={CheckCircle2}
                    tone="emerald"
                    label="Status"
                    value={existingCapacity ? "Configured" : "Not configured"}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Calculated fields are read-only. Non-core hours are derived from logged non-core
                  work items and update as the team logs time.
                </p>
              </div>

              {validationError && (
                <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {validationError}
                </div>
              )}

              <div className="mt-6 flex items-center justify-end gap-2">
                <Link
                  to="/efficiency"
                  className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </Link>
                <button
                  type="button"
                  onClick={handleSaveAndNext}
                  disabled={Boolean(validationError) || saving || savingNext || !employeeId}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#e6e6fa] px-4 text-xs font-semibold text-[#2b2bb5] shadow-sm transition-all hover:bg-[#dcdcf8] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingNext && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save &amp; next
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={Boolean(validationError) || saving || savingNext || !employeeId}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#23239a] disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="capacity-save"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save capacity
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}