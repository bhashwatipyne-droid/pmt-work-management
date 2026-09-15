import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  getEfficiencyOverview,
  getMonthlyCapacityList,
  saveMonthlyCapacity,
} from "@/services/api";

import {
  EfficiencyFilters,
  currentMonth,
  monthLabel,
} from "@/components/efficiency/EfficiencyFilters";
import { fmtHours } from "@/components/efficiency/EfficiencyKpiCards";

const DEFAULT_HOURS_PER_DAY = 8.5;

const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 " +
  "focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const Calc = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-1 text-base font-semibold text-slate-900">{value}</div>
  </div>
);

export default function EfficiencyMonthlyCapacityPage() {
  const { currentUser, loading: userLoading } = useUser();

  const [month, setMonth] = useState(currentMonth());
  const [employeeId, setEmployeeId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [capacities, setCapacities] = useState([]);

  const [workingDays, setWorkingDays] = useState("");
  const [leaveDays, setLeaveDays] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(DEFAULT_HOURS_PER_DAY);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canConfigure = ["admin", "manager"].includes(currentUser?.role);

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

  const handleSave = async () => {
    if (validationError || !employeeId) return;

    setSaving(true);
    try {
      await saveMonthlyCapacity({
        user_id: employeeId,
        month,
        working_days: wd,
        leave_days: ld,
        working_hours_per_day: hpd,
      });
      toast.success("Capacity saved");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save capacity");
    } finally {
      setSaving(false);
    }
  };

  if (userLoading || !currentUser) return null;

  if (!canConfigure) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Monthly capacity setup is available to managers and admins only
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

      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Monthly capacity</h1>
        <p className="text-sm text-slate-500">
          Configure employee capacity for {monthLabel(month)}
        </p>
      </div>

      <div className="mb-4">
        <EfficiencyFilters month={month} onMonthChange={setMonth} />
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          {/* Employee list */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800">
              Employees
            </div>
            <div className="max-h-[460px] overflow-y-auto">
              {employees.map((e) => {
                const configured = capacities.some((c) => c.user_id === e.user_id);
                return (
                  <button
                    key={e.user_id}
                    type="button"
                    onClick={() => setEmployeeId(e.user_id)}
                    className={`flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left text-sm last:border-0 ${
                      e.user_id === employeeId ? "bg-[#f0f0fd]" : "hover:bg-slate-50"
                    }`}
                  >
                    <span>
                      <span className="block font-medium text-slate-800">{e.name}</span>
                      <span className="block text-xs text-slate-400">{e.department || "—"}</span>
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
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
              {employees.length === 0 && (
                <div className="px-4 py-6 text-sm text-slate-500">No employees found.</div>
              )}
            </div>
          </div>

          {/* Form */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-slate-600">Working days</span>
                <input
                  type="number"
                  min="0"
                  max="31"
                  value={workingDays}
                  onChange={(e) => setWorkingDays(e.target.value)}
                  className={inputClass}
                  data-testid="capacity-working-days"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-slate-600">Leave days</span>
                <input
                  type="number"
                  min="0"
                  value={leaveDays}
                  onChange={(e) => setLeaveDays(e.target.value)}
                  className={inputClass}
                  data-testid="capacity-leave-days"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-slate-600">Working hours/day</span>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={hoursPerDay}
                  onChange={(e) => setHoursPerDay(e.target.value)}
                  className={inputClass}
                  data-testid="capacity-hours-per-day"
                />
              </label>
            </div>

            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Calculated capacity</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Calc label="Working days after leave" value={afterLeave.toFixed(2)} />
                <Calc label="Monthly working hours" value={fmtHours(monthlyHours)} />
                <Calc label="Non-core hours (logged)" value={fmtHours(nonCoreHours)} />
                <Calc label="Core hours" value={fmtHours(coreHours)} />
                <Calc label="Core days" value={coreDays.toFixed(2)} />
                <Calc
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
                onClick={handleSave}
                disabled={Boolean(validationError) || saving || !employeeId}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#23239a] disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="capacity-save"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Save capacity
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}