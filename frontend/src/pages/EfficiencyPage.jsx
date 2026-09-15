import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Settings2, CalendarRange, Target, ChevronDown } from "lucide-react";

import { useUser } from "@/context/UserContext";
import { getEfficiencyOverview, getEfficiencyTrend } from "@/services/api";

import { EfficiencyKpiCards } from "@/components/efficiency/EfficiencyKpiCards";
import {
  EfficiencyFilters,
  currentMonth,
  monthLabel,
} from "@/components/efficiency/EfficiencyFilters";
import { TeamEfficiencyTable } from "@/components/efficiency/TeamEfficiencyTable";
import { EfficiencyTrendChart } from "@/components/efficiency/EfficiencyTrendChart";
import { EfficiencyAttentionPanel } from "@/components/efficiency/EfficiencyAttentionPanel";
import { EmployeeEfficiencyDrawer } from "@/components/efficiency/EmployeeEfficiencyDrawer";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export default function EfficiencyPage() {
  const { currentUser, loading: userLoading } = useUser();
  const navigate = useNavigate();

  const [month, setMonth] = useState(currentMonth());
  const [department, setDepartment] = useState("");
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
    if (department) rows = rows.filter((e) => e.department === department);
    if (employee) rows = rows.filter((e) => e.user_id === employee);
    return rows;
  }, [overview, department, employee]);

  if (userLoading || !currentUser) return null;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Efficiency</h1>
          <p className="text-sm text-slate-500">
            Team productivity for {monthLabel(month)}
          </p>
        </div>

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

      <div className="mb-4">
        <EfficiencyFilters
          month={month}
          onMonthChange={setMonth}
          department={department}
          onDepartmentChange={departments.length > 1 ? setDepartment : undefined}
          departments={departments}
          employee={employee}
          onEmployeeChange={setEmployee}
          employees={overview?.employees || []}
        />
      </div>

      {loading && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {overview && !loading && !error && (
        <div className="flex flex-col gap-5">
          <EfficiencyKpiCards kpis={overview.kpis} />

          <TeamEfficiencyTable
            employees={employees}
            onSelect={(e) => setDrawerUserId(e.user_id)}
          />

          <div className="grid gap-5 lg:grid-cols-2">
            <EfficiencyTrendChart data={trend} />
            <EfficiencyAttentionPanel attention={overview.attention} />
          </div>

          <p className="pb-4 text-xs text-slate-400">
            Productivity rollup: {overview.aggregation}. Core deliverables count only when the work
            item status is Closed. Non-core hours come from logged time on non-core work items.
          </p>
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