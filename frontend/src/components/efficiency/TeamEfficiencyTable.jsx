import { AlertCircle } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtHours, fmtPct } from "./EfficiencyKpiCards";

const scoreTone = (v) => {
  if (v >= 85) return "text-emerald-600";
  if (v >= 65) return "text-amber-600";
  return "text-rose-600";
};

export const TeamEfficiencyTable = ({ employees = [], onSelect }) => (
  <div className="rounded-xl border border-slate-200 bg-white">
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Team efficiency</h3>
        <p className="text-xs text-slate-500">
          Click an employee to see how the score was calculated
        </p>
      </div>
    </div>

    <div className="overflow-x-auto">
      <Table data-testid="efficiency-team-table">
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Working days</TableHead>
            <TableHead>Leave</TableHead>
            <TableHead>Core days</TableHead>
            <TableHead>Core hours</TableHead>
            <TableHead>Non-core hours</TableHead>
            <TableHead>Deliverables</TableHead>
            <TableHead className="text-right">Productivity</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {employees.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-sm text-slate-500">
                No employees to show for this month.
              </TableCell>
            </TableRow>
          )}

          {employees.map((e) => (
            <TableRow
              key={e.user_id}
              onClick={() => onSelect?.(e)}
              className="cursor-pointer"
              data-testid={`efficiency-row-${e.user_id}`}
            >
              <TableCell className="font-medium text-slate-800">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f0f0fd] text-[11px] font-semibold text-[#1a1a8a]">
                    {(e.name || "?").charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <div>{e.name}</div>
                    {e.department && (
                      <div className="text-xs text-slate-400">{e.department}</div>
                    )}
                  </div>
                </div>
              </TableCell>

              <TableCell>{e.has_capacity ? e.working_days : "—"}</TableCell>
              <TableCell>{e.has_capacity ? e.leave_days : "—"}</TableCell>
              <TableCell>{e.has_capacity ? e.core_days : "—"}</TableCell>
              <TableCell>{e.has_capacity ? fmtHours(e.core_hours) : "—"}</TableCell>
              <TableCell>{fmtHours(e.non_core_hours)}</TableCell>
              <TableCell>{e.closed_deliverables}</TableCell>

              <TableCell className="text-right">
                {e.has_capacity ? (
                  <span className={`font-semibold ${scoreTone(e.productivity)}`}>
                    {fmtPct(e.productivity)}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Capacity not set
                  </span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
);