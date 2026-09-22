import { useEffect, useState } from "react";
import { avatarColorClasses } from "@/lib/avatarColors";
import { Loader2 } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getEmployeeEfficiency } from "@/services/api";

import { fmtHours, fmtPct } from "./EfficiencyKpiCards";
import { monthLabel } from "./EfficiencyFilters";

const Stat = ({ label, value }) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
      {label}
    </div>
    <div className="mt-1 text-lg font-semibold text-slate-900">{value}</div>
  </div>
);

export const EmployeeEfficiencyDrawer = ({ employeeId, month, open, onOpenChange }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !employeeId || !month) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getEmployeeEfficiency(employeeId, month)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError("Could not load this employee's efficiency."))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [employeeId, month, open]);

  const nonCoreTotal = (data?.non_core_by_type || []).reduce((a, b) => a + b.hours, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto bg-[#f7f9fc] sm:max-w-2xl"
        data-testid="efficiency-employee-drawer"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${avatarColorClasses(employeeId)}`}
            >
              {(data?.name || "?").charAt(0).toUpperCase()}
            </span>
            <span>
              <span className="block text-base font-semibold text-slate-900">
                {data?.name || "Employee"}
              </span>
              <span className="block text-xs font-normal text-slate-500">
                {[data?.department, monthLabel(month)].filter(Boolean).join(" · ")}
              </span>
            </span>
          </SheetTitle>
          <SheetDescription className="sr-only">
            Efficiency breakdown for the selected employee and month
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
          </div>
        )}

        {error && !loading && (
          <div className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800">
            {error}
          </div>
        )}

        {data && !loading && (
          <div className="mt-5 flex flex-col gap-5 pb-8">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">
                Productivity
              </div>
              <div className="mt-1 text-3xl font-semibold text-indigo-900">
                {data.has_capacity ? fmtPct(data.productivity) : "—"}
              </div>
              {!data.has_capacity && (
                <div className="mt-1 text-xs text-indigo-700">
                  Monthly capacity is not configured, so no score can be calculated.
                </div>
              )}
            </div>

            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Capacity breakdown</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Working days" value={data.working_days} />
                <Stat label="Leave days" value={data.leave_days} />
                <Stat label="After leave" value={data.working_days_after_leave} />
                <Stat label="Hours/day" value={fmtHours(data.working_hours_per_day)} />
                <Stat label="Monthly hours" value={fmtHours(data.monthly_working_hours)} />
                <Stat label="Non-core hours" value={fmtHours(data.non_core_hours)} />
                <Stat label="Core hours" value={fmtHours(data.core_hours)} />
                <Stat label="Core days" value={data.core_days} />
              </div>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Activity productivity</h4>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Activity</TableHead>
                      <TableHead>Daily</TableHead>
                      <TableHead>Monthly potential</TableHead>
                      <TableHead>Actual closed</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.activities?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-sm text-slate-500">
                          No active activity targets configured.
                        </TableCell>
                      </TableRow>
                    )}
                    {data.activities?.map((a) => (
                      <TableRow key={a.activity_name}>
                        <TableCell className="font-medium text-slate-800">
                          {a.activity_name}
                        </TableCell>
                        <TableCell>{a.daily_potential}</TableCell>
                        <TableCell>{a.monthly_potential}</TableCell>
                        <TableCell>{a.actual_closed}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {fmtPct(a.productivity)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {data.untracked_closed_deliverables > 0 && (
                <p className="mt-2 text-xs text-amber-600">
                  {data.untracked_closed_deliverables} closed core deliverable
                  {data.untracked_closed_deliverables > 1 ? "s are" : " is"} not covered by any
                  configured activity target and does not count toward the score.
                </p>
              )}
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-800">Non-core time</h4>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                {data.non_core_by_type?.length === 0 && (
                  <div className="text-sm text-slate-500">No non-core time logged this month.</div>
                )}
                {data.non_core_by_type?.map((n) => (
                  <div
                    key={n.deliverable_type}
                    className="flex items-center justify-between border-b border-slate-100 py-2 text-sm last:border-0"
                  >
                    <span className="text-slate-600">{n.deliverable_type}</span>
                    <span className="font-medium text-slate-900">{fmtHours(n.hours)}</span>
                  </div>
                ))}
                {data.non_core_by_type?.length > 0 && (
                  <div className="flex items-center justify-between pt-2 text-sm font-semibold text-slate-900">
                    <span>Total</span>
                    <span>{fmtHours(nonCoreTotal)}</span>
                  </div>
                )}
              </div>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-800">How this was calculated</h4>
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-relaxed text-slate-600">
                {Object.entries(data.formula || {}).map(([k, v]) => (
                  <div key={k} className="flex flex-col border-b border-slate-100 py-1.5 last:border-0 sm:flex-row sm:gap-3">
                    <span className="w-56 flex-shrink-0 font-medium text-slate-700">
                      {k.replace(/_/g, " ")}
                    </span>
                    <span className="font-mono">{v}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-800">
                Closed core deliverables ({data.deliverables?.length || 0})
              </h4>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Deliverable</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.deliverables?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="py-6 text-center text-sm text-slate-500">
                          No closed core deliverables this month.
                        </TableCell>
                      </TableRow>
                    )}
                    {data.deliverables?.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="whitespace-nowrap text-slate-500">
                          {d.work_date}
                        </TableCell>
                        <TableCell className="text-slate-800">
                          {d.deliverable_name || "Untitled"}
                        </TableCell>
                        <TableCell className="text-slate-500">{d.deliverable_type}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};