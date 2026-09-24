import { CalendarDays, Filter, RotateCcw } from "lucide-react";
import { format, parseISO } from "date-fns";

import { PROJECT_STATUSES } from "@/constants/projectPalette";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const ProjectFilterPanel = ({
  onClose,
  statusFilter,
  setStatusFilter,
  clientFilter,
  setClientFilter,
  pocFilter,
  setPocFilter,
  dateFrom,
  dateTo,
  setDateFrom,
  setDateTo,
  visibility,
  setVisibility,
  clients,
  pocOptions,
  activeFilterCount,
  onClear,
  // Hidden projects are an admin-only view; everyone else only sees visible ones.
  canFilterVisibility = true,
}) => {
  const dateRange = {
    from: dateFrom ? parseISO(dateFrom) : undefined,
    to: dateTo ? parseISO(dateTo) : undefined,
  };

  const handleDateRangeChange = (range) => {
    setDateFrom(range?.from ? format(range.from, "yyyy-MM-dd") : "");
    setDateTo(range?.to ? format(range.to, "yyyy-MM-dd") : "");
  };

  return (
    <div className="w-[360px]">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-[#2b2bb5]" />
            <div>
              <div className="text-sm font-semibold text-slate-900">Filters</div>
              <div className="text-[11px] text-slate-500">
                {activeFilterCount
                  ? `${activeFilterCount} active`
                  : "Filter your projects"}
              </div>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2b2bb5] hover:underline"
            >
              <RotateCcw className="h-3 w-3" />
              Clear all
            </button>
          )}
        </div>

        <div className="space-y-4 p-4">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Status
            </span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm font-medium text-foreground outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
            >
              <option value="">All status</option>
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Client
            </span>
            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm font-medium text-foreground outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
            >
              <option value="">All clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              POC / Owner
            </span>
            <select
              value={pocFilter}
              onChange={(event) => setPocFilter(event.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm font-medium text-foreground outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
            >
              <option value="">All POCs / Owners</option>
              {pocOptions.map((poc) => (
                <option key={poc} value={poc}>
                  {poc}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Due date
            </span>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={[
                    "inline-flex h-10 w-full items-center gap-2 rounded-lg border bg-white px-3 text-sm outline-none transition-colors",
                    "focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20",
                    dateFrom || dateTo
                      ? "border-[#2b2bb5] text-foreground"
                      : "border-input text-muted-foreground",
                  ].join(" ")}
                >
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  {dateFrom && dateTo ? (
                    <span>
                      {format(parseISO(dateFrom), "dd MMM")} – {format(parseISO(dateTo), "dd MMM")}
                    </span>
                  ) : dateFrom ? (
                    <span>From {format(parseISO(dateFrom), "dd MMM")}</span>
                  ) : (
                    <span>Select date range</span>
                  )}
                </button>
              </PopoverTrigger>

              <PopoverContent align="start" className="w-auto rounded-xl p-0">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={handleDateRangeChange}
                  numberOfMonths={1}
                  initialFocus
                />
                {(dateFrom || dateTo) && (
                  <div className="border-t border-border px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setDateFrom("");
                        setDateTo("");
                      }}
                      className="text-xs font-medium text-[#2b2bb5] hover:underline"
                    >
                      Clear date range
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {canFilterVisibility && (
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Visibility
            </span>
            <select
              value={visibility}
              onChange={(event) => {
                setVisibility(event.target.value);
                onClose?.();
              }}
              className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm font-medium text-foreground outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
            >
              <option value="visible">Visible projects</option>
              <option value="hidden">Hidden projects</option>
              <option value="all">All projects</option>
            </select>
          </label>
          )}
        </div>
    </div>
  );
};