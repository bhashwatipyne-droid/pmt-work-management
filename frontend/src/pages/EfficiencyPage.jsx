import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings2,
  CalendarRange,
  Target,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

import { useUser } from "@/context/UserContext";
import { getEfficiencyOverview, getEfficiencyTrend } from "@/services/api";

import { EfficiencyKpiCards } from "@/components/efficiency/EfficiencyKpiCards";
import {
  currentMonth,
  monthOptions,
  monthLabel,
  shiftMonth,
} from "@/components/efficiency/EfficiencyFilters";
import { TeamEfficiencyTable } from "@/components/efficiency/TeamEfficiencyTable";
import { EmployeeEfficiencyDrawer } from "@/components/efficiency/EmployeeEfficiencyDrawer";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { EfficiencyContentSkeleton } from "@/components/skeletons/Skeletons";

const fieldClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 " +
  "focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/20";

export default function EfficiencyPage() {
  const { currentUser, loading: userLoading } = useUser();
  const navigate = useNavigate();

  const [month, setMonth] = useState(currentMonth());
  const [employee, setEmployee] = useState("");

  const [overview, setOverview] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [drawerUserId, setDrawerUserId] = useState(null);

  const canConfigure = ["admin", "manager"].includes(currentUser?.role);
  const isManager = currentUser?.role === "manager";

  const load = useCallback(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getEfficiencyOverview(month)
      .then((d) => !cancelled && setOverview(d))
      .catch(() => !cancelled && setError("Could not load efficiency data. Please refresh."))
      .finally(() => !cancelled && setLoading(false));

    getEfficiencyTrend(month, 6)
      .then((d) => !cancelled && setTrend(d))
      .catch(() => {
        // Non-critical.
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => load(), [load]);

  const departments = useMemo(
    () =>
      Array.from(
        new Set((overview?.employees || []).map((e) => e.department).filter(Boolean))
      ).sort(),
    [overview]
  );

  const employees = useMemo(() => {
    let rows = overview?.employees || [];
    if (employee) rows = rows.filter((e) => e.user_id === employee);
    return rows;
  }, [overview, employee]);

  const employeesTotal = overview?.kpis?.employees_total ?? 0;
  const employeesTracked = overview?.kpis?.employees_tracked ?? 0;
  const employeesMissing = Math.max(0, employeesTotal - employeesTracked);

  if (userLoading || !currentUser) return null;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Efficiency</h1>
          <p className="text-sm text-slate-500">Team productivity overview</p>
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
              onClick={() => setMonth(shiftMonth(month, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <select
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
            className={fieldClass}
            data-testid="efficiency-employee-select"
          >
            <option value="">All employees</option>
            {(overview?.employees || []).map((e) => (
              <option key={e.user_id} value={e.user_id}>
                {e.name}
              </option>
            ))}
          </select>

          {canConfigure && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#23239a] hover:shadow-md"
                >
                  <Settings2 className="h-4 w-4" />
                  Efficiency settings
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => navigate("/efficiency/settings/monthly-capacity")}
                >
                  <CalendarRange className="mr-2 h-4 w-4" />
                  Monthly capacity
                </DropdownMenuItem>

                {isManager && (
                  <DropdownMenuItem
                    onClick={() => navigate("/efficiency/settings/activity-targets")}
                  >
                    <Target className="mr-2 h-4 w-4" />
                    Team potential
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {loading && <EfficiencyContentSkeleton />}

      {error && !loading && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {overview && !loading && !error && (
        <div className="flex flex-col gap-5">
          {employeesMissing > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                  <AlertTriangle className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-rose-800">
                    {employeesMissing} of {employeesTotal} employees need capacity settings
                  </p>
                  <p className="text-xs text-rose-700">
                    Set capacity to calculate productivity and track utilization accurately.
                  </p>
                </div>
              </div>

              {canConfigure && (
                <button
                  type="button"
                  onClick={() => navigate("/efficiency/settings/monthly-capacity")}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-rose-100 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-200"
                >
                  Set capacity for all
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <EfficiencyKpiCards kpis={overview.kpis} trend={trend} />

          <TeamEfficiencyTable
            employees={employees}
            departments={departments}
            month={month}
            canManageCapacity={canConfigure}
            canSetPotential={isManager}
            onSelect={(e) => setDrawerUserId(e.user_id)}
          />
        </div>
      )}

      <EmployeeEfficiencyDrawer
        employeeId={drawerUserId}
        month={month}
        open={Boolean(drawerUserId)}
        onOpenChange={(open) => !open && setDrawerUserId(null)}
      />
    </div>
  );
}