import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays, SlidersHorizontal } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { APPROVALS } from "@/constants/testIds";

const EMPTY_VALUES = {
  authorityFilter: "",
  stageFilter: "",
  visibility: "all",
  projectFilter: "",
  dateFrom: "",
  dateTo: "",
};

/**
 * Filters control for the Approvals board.
 *
 * Self-contained: renders its own trigger button (with the active-filter
 * count badge) and its own Popover, so the panel anchors to the button
 * instead of opening as a centered page-level dialog. Owns its own draft
 * state so opening/closing without hitting "Apply filters" never mutates
 * the parent's committed filters.
 */
export default function ApprovalsFilterModal({
  columns,
  stages,
  projectOptions,
  initialValues,
  onApply,
  activeFilterCount = 0,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_VALUES, ...initialValues });

  // Re-sync the draft to whatever is currently applied every time the
  // panel is opened, so it always starts from the committed filters.
  useEffect(() => {
    if (open) {
      setDraft({ ...EMPTY_VALUES, ...initialValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const setField = (key) => (value) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const clearDraft = () => setDraft({ ...EMPTY_VALUES });

  const handleApply = () => {
    onApply(draft);
    setOpen(false);
  };

  const dateRangeValue = {
    from: draft.dateFrom ? parseISO(draft.dateFrom) : undefined,
    to: draft.dateTo ? parseISO(draft.dateTo) : undefined,
  };

  const handleDateRangeChange = (range) => {
    setDraft((prev) => ({
      ...prev,
      dateFrom: range?.from ? format(range.from, "yyyy-MM-dd") : "",
      dateTo: range?.to ? format(range.to, "yyyy-MM-dd") : "",
    }));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={APPROVALS.filterButton}
          className={[
            "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium outline-none transition-colors",
            "focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20",
            activeFilterCount > 0
              ? "border-[#2b2bb5] text-[#2b2bb5]"
              : "border-input text-foreground hover:bg-slate-50",
          ].join(" ")}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#eef0ff] px-1.5 text-[11px] font-semibold text-[#2b2bb5]">
              {activeFilterCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 rounded-xl p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-foreground">
            Filters
          </span>

          <button
            type="button"
            onClick={clearDraft}
            className="text-xs font-medium text-[#2b2bb5] hover:underline"
          >
            Clear all
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Approval authority
            </label>

            <select
              data-testid={APPROVALS.filterAuthority}
              value={draft.authorityFilter}
              onChange={(e) => setField("authorityFilter")(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
            >
              <option value="">All</option>
              {columns.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Production stage
            </label>

            <select
              data-testid={APPROVALS.filterStage}
              value={draft.stageFilter}
              onChange={(e) => setField("stageFilter")(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
            >
              <option value="">All</option>
              {stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Status
            </label>

            <select
              data-testid={APPROVALS.filterStatus}
              value={draft.visibility}
              onChange={(e) => setField("visibility")(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
            >
              <option value="visible">Pending</option>
              <option value="hidden">Hidden</option>
              <option value="all">All</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Date range
            </label>

            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={[
                    "flex h-10 w-full items-center gap-2 rounded-lg border bg-white px-3 text-sm outline-none transition-colors",
                    "focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20",
                    draft.dateFrom || draft.dateTo
                      ? "border-[#2b2bb5] text-foreground"
                      : "border-input text-muted-foreground",
                  ].join(" ")}
                >
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  {draft.dateFrom && draft.dateTo ? (
                    <span>
                      {format(parseISO(draft.dateFrom), "dd MMM")} –{" "}
                      {format(parseISO(draft.dateTo), "dd MMM")}
                    </span>
                  ) : (
                    <span>Select date range</span>
                  )}
                </button>
              </PopoverTrigger>

              <PopoverContent align="start" className="w-auto rounded-xl p-0">
                <Calendar
                  mode="range"
                  selected={dateRangeValue}
                  onSelect={handleDateRangeChange}
                  numberOfMonths={1}
                  initialFocus
                />

                {(draft.dateFrom || draft.dateTo) && (
                  <div className="border-t border-border px-4 py-3">
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          dateFrom: "",
                          dateTo: "",
                        }))
                      }
                      className="text-xs font-medium text-[#2b2bb5] hover:underline"
                    >
                      Clear date range
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Project
            </label>

            <select
              data-testid={APPROVALS.filterProject}
              value={draft.projectFilter}
              onChange={(e) => setField("projectFilter")(e.target.value)}
              className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
            >
              <option value="">All</option>
              {projectOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleApply}
          className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#2b2bb5] px-4 text-sm font-semibold text-white hover:bg-[#1a1a8a]"
        >
          Apply filters
        </button>
      </PopoverContent>
    </Popover>
  );
}