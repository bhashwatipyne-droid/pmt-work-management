import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings2,
  CalendarRange,
  Target,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Download,
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
import { TeamEfficiencyTable, downloadCsv } from "@/components/efficiency/TeamEfficiencyTable";
import { EmployeeEfficiencyDrawer } from "@/components/efficiency/EmployeeEfficiencyDrawer";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { EfficiencyContentSkeleton } from "@/components/skeletons/Skeletons";

export default function EfficiencyPage() {
  const { currentUser, loading: userLoading } = useUser();
  const navigate = useNavigate();

  const [month, setMonth] = useState(currentMonth());

  const [overview, setOverview] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [drawerUserId, setDrawerUserId] = useState(null);
  const [visibleRows, setVisibleRows] = useState([]);

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

  const employees = overview?.employees || [];

  const employeesTotal = overview?.kpis?.employees_total ?? 0;
  const employeesTracked = overview?.kpis?.employees_tracked ?? 0;
  const employeesMissing = Math.max(0, employeesTotal - employeesTracked);

  if (userLoading || !currentUser) return null;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="min-w-[160px] flex-1 text-xl font-semibold tracking-tight text-slate-900">
          Efficiency
        </h1>

        <div className="flex items-center rounded-lg shadow-[inset_0_0_0_1px_rgba(226,232,240,1)]">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-50"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {/* Kept as a real <select> so any month is still one click away
              (not just prev/next) — just stripped of the usual border/
              chrome so it reads as plain text, matching the mock. */}
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            data-testid="efficiency-month-select"
            className="h-8 min-w-[120px] appearance-none border-0 bg-transparent text-center text-[13px] font-medium text-slate-800 focus:outline-none"
          >
            {monthOptions().map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>

          {/* There is no data for a month that has not happened yet. */}
          <button
            type="button"
            aria-label="Next month"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= currentMonth()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => downloadCsv(visibleRows, month)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>

        {canConfigure && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#f0f0fd] px-3 text-xs font-semibold text-[#2b2bb5] hover:bg-[#e4e4fb]"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Capacity settings
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

      {loading && <EfficiencyContentSkeleton />}

      {error && !loading && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {overview && !loading && !error && (
        <div className="flex flex-col gap-5">
          {employeesMissing > 0 && (
            <div className="flex items-center gap-3 rounded-[10px] bg-amber-100 px-3.5 py-2.5 text-[13px] text-amber-900">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="flex-1">
                <strong>
                  {employeesMissing} of {employeesTotal} employees
                </strong>{" "}
                have no capacity set, so their productivity is not calculated.
              </span>

              {canConfigure && (
                <button
                  type="button"
                  onClick={() => navigate("/efficiency/settings/monthly-capacity")}
                  className="h-7 shrink-0 rounded-lg bg-white px-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-50"
                >
                  Set capacity
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
            onFilteredRowsChange={setVisibleRows}
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