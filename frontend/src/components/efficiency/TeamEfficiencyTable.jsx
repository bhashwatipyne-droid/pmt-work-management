import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  HelpCircle,
  MoreVertical,
  Search,
  Settings2,
  Target,
} from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { fmtHours, fmtPct } from "./EfficiencyKpiCards";

const PAGE_SIZE = 8;

const fieldClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 " +
  "focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const selectClass =
  "h-9 appearance-none rounded-lg border border-slate-200 bg-white " +
  "pl-3 pr-9 text-sm text-slate-800 " +
  "focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const productivityTone = (v) => {
  if (v >= 70) return { label: "High", pill: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500", text: "text-emerald-600" };
  if (v >= 40) return { label: "Medium", pill: "bg-amber-50 text-amber-700", bar: "bg-amber-500", text: "text-amber-600" };
  return { label: "Low", pill: "bg-rose-50 text-rose-700", bar: "bg-rose-500", text: "text-rose-600" };
};

const toCsv = (rows) => {
  const header = [
    "Employee", "Department", "Working days", "Leave", "Core days",
    "Core hours", "Non-core hours", "Deliverables", "Productivity", "Status",
  ];
  const lines = rows.map((e) => [
    e.name,
    e.department || "",
    e.has_capacity ? e.working_days : "",
    e.has_capacity ? e.leave_days : "",
    e.has_capacity ? e.core_days : "",
    e.has_capacity ? e.core_hours : "",
    e.non_core_hours,
    e.closed_deliverables,
    e.has_capacity ? e.productivity : "",
    e.has_capacity ? productivityTone(e.productivity).label : "Capacity not set",
  ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));

  return [header.join(","), ...lines].join("\n");
};

const downloadCsv = (rows, month) => {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `efficiency-${month || "export"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const TeamEfficiencyTable = ({
  employees = [],
  departments = [],
  month,
  canManageCapacity = false,
  canSetPotential = false,
  onSelect,
}) => {
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [capacityStatus, setCapacityStatus] = useState("");
  const [sortBy, setSortBy] = useState("productivity_desc");
  const [page, setPage] = useState(1);
  const [showHelp, setShowHelp] = useState(false);

  const filtered = useMemo(() => {
    let rows = employees;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((e) => e.name?.toLowerCase().includes(q));
    }

    if (department) {
      rows = rows.filter((e) => e.department === department);
    }

    if (capacityStatus === "set") {
      rows = rows.filter((e) => e.has_capacity);
    } else if (capacityStatus === "not_set") {
      rows = rows.filter((e) => !e.has_capacity);
    }

    const sorted = [...rows].sort((a, b) => {
      switch (sortBy) {
        case "productivity_asc":
          return (a.has_capacity ? a.productivity : -1) - (b.has_capacity ? b.productivity : -1);
        case "name_asc":
          return (a.name || "").localeCompare(b.name || "");
        case "deliverables_desc":
          return (b.closed_deliverables || 0) - (a.closed_deliverables || 0);
        case "productivity_desc":
        default:
          return (b.has_capacity ? b.productivity : -1) - (a.has_capacity ? a.productivity : -1);
      }
    });

    return sorted;
  }, [employees, search, department, capacityStatus, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const goToPage = (p) => setPage(Math.min(totalPages, Math.max(1, p)));

  const resetToFirstPage = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Team performance</h3>
          <p className="text-xs text-slate-500">Compare employee productivity and capacity</p>
        </div>

        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2b2bb5] hover:underline"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          How is productivity calculated?
        </button>
      </div>

      {showHelp && (
        <div className="border-b border-slate-200 bg-[#f7f7fd] px-4 py-3 text-xs text-slate-600">
          Productivity = actual closed core deliverables ÷ monthly potential (daily potential set
          per employee × core days), shown as a percentage. It needs both monthly capacity and at
          least one core activity target configured for that employee to calculate.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-200 px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => resetToFirstPage(setSearch)(e.target.value)}
            className={`${fieldClass} w-48 pl-8`}
          />
        </div>

        <div className="relative w-[155px]">
          <select
            value={department}
            onChange={(e) => resetToFirstPage(setDepartment)(e.target.value)}
            className={`${selectClass} w-full`}
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            strokeWidth={2}
          />
        </div>

        <div className="relative w-[172px]">
          <select
            value={capacityStatus}
            onChange={(e) => resetToFirstPage(setCapacityStatus)(e.target.value)}
            className={`${selectClass} w-full`}
          >
            <option value="">All capacity status</option>
            <option value="set">Capacity set</option>
            <option value="not_set">Capacity not set</option>
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
            strokeWidth={2}
          />
        </div>

        <div className="ml-auto flex items-center gap-2.5">
          <span className="text-xs text-slate-400">Sort by</span>
          <div className="relative w-[218px]">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={`${selectClass} w-full`}
            >
              <option value="productivity_desc">Productivity (high to low)</option>
              <option value="productivity_asc">Productivity (low to high)</option>
              <option value="name_asc">Name (A–Z)</option>
              <option value="deliverables_desc">Deliverables (high to low)</option>
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
              strokeWidth={2}
            />
          </div>

          <button
            type="button"
            onClick={() => downloadCsv(filtered, month)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      <Table data-testid="efficiency-team-table" className="table-fixed min-w-[1090px]">
        <colgroup>
          <col className="w-[165px]" /> {/* Employee */}
          <col className="w-[100px]" /> {/* Department */}
          <col className="w-[85px]" />  {/* Working days */}
          <col className="w-[65px]" />  {/* Leave */}
          <col className="w-[85px]" />  {/* Core days */}
          <col className="w-[90px]" />  {/* Core hours */}
          <col className="w-[100px]" /> {/* Non-core hours */}
          <col className="w-[85px]" />  {/* Deliverables */}
          <col className="w-[140px]" /> {/* Productivity */}
          <col className="w-[140px]" /> {/* Status */}
          <col className="w-[45px]" />  {/* Actions */}
        </colgroup>

        <TableHeader>
          <TableRow>
            <TableHead className="h-12 px-3 text-xs font-medium leading-4 text-slate-500">
              Employee
            </TableHead>
            <TableHead className="h-12 px-3 text-xs font-medium leading-4 text-slate-500">
              Department
            </TableHead>
            <TableHead className="h-12 px-3 text-xs font-medium leading-4 text-slate-500">
              Working days
            </TableHead>
            <TableHead className="h-12 px-3 text-xs font-medium leading-4 text-slate-500">
              Leave
            </TableHead>
            <TableHead className="h-12 px-3 text-xs font-medium leading-4 text-slate-500">
              Core days
            </TableHead>
            <TableHead className="h-12 px-3 text-xs font-medium leading-4 text-slate-500">
              Core hours
            </TableHead>
            <TableHead className="h-12 px-3 text-xs font-medium leading-4 text-slate-500">
              Non-core hours
            </TableHead>
            <TableHead className="h-12 px-3 text-xs font-medium leading-4 text-slate-500">
              Deliverables
            </TableHead>
            <TableHead className="h-12 px-3 text-xs font-medium leading-4 text-slate-500">
              Productivity
            </TableHead>
            <TableHead className="h-12 px-3 text-xs font-medium leading-4 text-slate-500">
              Status
            </TableHead>
            <TableHead className="h-12 px-3 text-right text-xs font-medium leading-4 text-slate-500">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-sm text-slate-500">
                  No employees match these filters.
                </TableCell>
              </TableRow>
            )}

            {pageRows.map((e) => {
              const tone = e.has_capacity ? productivityTone(e.productivity) : null;

              return (
                <TableRow
                  key={e.user_id}
                  onClick={() => onSelect?.(e)}
                  className="h-[60px] cursor-pointer"
                  data-testid={`efficiency-row-${e.user_id}`}
                >
                  <TableCell className="px-3 py-3 font-medium text-slate-800">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f0f0fd] text-[11px] font-semibold text-[#1a1a8a]">
                        {(e.name || "?").charAt(0).toUpperCase()}
                      </span>
                      <span className="truncate whitespace-nowrap">{e.name}</span>
                    </div>
                  </TableCell>

                  <TableCell className="px-3 py-3 text-slate-500">{e.department || "—"}</TableCell>
                  <TableCell className="px-3 py-3">{e.has_capacity ? e.working_days : "—"}</TableCell>
                  <TableCell className="px-3 py-3">{e.has_capacity ? e.leave_days : "—"}</TableCell>
                  <TableCell className="px-3 py-3">{e.has_capacity ? e.core_days : "—"}</TableCell>
                  <TableCell className="px-3 py-3">{e.has_capacity ? fmtHours(e.core_hours) : "—"}</TableCell>
                  <TableCell className="px-3 py-3">{fmtHours(e.non_core_hours)}</TableCell>
                  <TableCell className="px-3 py-3">{e.closed_deliverables}</TableCell>

                  <TableCell className="px-3 py-3">
                    {e.has_capacity ? (
                      <div className="flex items-center gap-2.5 whitespace-nowrap">
                        <span className={`min-w-[42px] text-sm font-semibold ${tone.text}`}>
                          {fmtPct(e.productivity)}
                        </span>
                        <div className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${tone.bar}`}
                            style={{ width: `${Math.min(100, Math.max(0, e.productivity))}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>

                  <TableCell className="px-3 py-3">
                    {e.has_capacity ? (
                      <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone.pill}`}>
                        {tone.label}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        Capacity not set
                      </span>
                    )}
                  </TableCell>

                  <TableCell
                    className="px-3 py-3 text-right"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Row actions"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onSelect?.(e)}>
                          View details
                        </DropdownMenuItem>
                        {canManageCapacity && (
                          <DropdownMenuItem
                            onClick={() => navigate("/efficiency/settings/monthly-capacity")}
                          >
                            <Settings2 className="mr-2 h-3.5 w-3.5" />
                            Set capacity
                          </DropdownMenuItem>
                        )}
                        {canSetPotential && (
                          <DropdownMenuItem
                            onClick={() => navigate("/efficiency/settings/activity-targets")}
                          >
                            <Target className="mr-2 h-3.5 w-3.5" />
                            Set potential
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
        <span>
          {filtered.length === 0
            ? "Showing 0 of 0 employees"
            : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)} of ${filtered.length} employees`}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 1}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => goToPage(p)}
              className={`flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold ${
                p === page
                  ? "bg-[#2b2bb5]/10 text-[#2b2bb5]"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              {p}
            </button>
          ))}

          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= totalPages}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 disabled:opacity-40"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};