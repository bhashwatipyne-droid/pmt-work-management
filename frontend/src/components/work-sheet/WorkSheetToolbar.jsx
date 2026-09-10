import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";
import {
  Plus,
  ChevronDown,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  History,
  SlidersHorizontal,
  Search,
} from "lucide-react";
import { WORKSHEET } from "@/constants/testIds";

export const WorkSheetToolbar = ({
  filters,
  setFilters,
  options,
  onOpenFilters,
  activeFilterCount = 0,
  onAddRow,
  canAdd,
  resultCount,
  onBulkAdd,
  bulkAdding,
  onOpenCloseDeliverable,
  onOpenQuickLogger,
  onOpenBulkReview,
  onOpenHistory,
}) => {
  return (
    <div className="border-b border-border bg-card">
      {/* ACTIONS ROW */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {onOpenCloseDeliverable && (
          <Button
            data-testid={WORKSHEET.closeDeliverableBtn}
            onClick={onOpenCloseDeliverable}
            size="sm"
            className="h-9 bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            Deliverable Closed
          </Button>
        )}

        {onOpenQuickLogger && (
          <Button
            onClick={onOpenQuickLogger}
            size="sm"
            variant="outline"
            className="h-9 border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100 hover:text-teal-900"
          >
            <Clock3 className="mr-2 h-4 w-4" />
            Quick Logger
          </Button>
        )}

        {onOpenBulkReview && (
          <Button
            onClick={onOpenBulkReview}
            size="sm"
            variant="outline"
            className="h-9"
          >
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Bulk Review
          </Button>
        )}

        {onOpenHistory && (
          <button
            type="button"
            title="Version history"
            aria-label="Version history"
            onClick={onOpenHistory}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <History className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* FILTER ROW */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            data-testid={WORKSHEET.searchInput}
            placeholder="Search deliverable or remarks..."
            value={filters.search}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                search: e.target.value,
              }))
            }
            className="h-9 w-64 pl-9"
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`h-9 transition-colors ${
            activeFilterCount > 0
              ? "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 hover:text-white"
              : ""
          }`}
          onClick={onOpenFilters}
        >
          <SlidersHorizontal className="mr-1.5 h-4 w-4" />
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {activeFilterCount}
            </span>
          )}
        </Button>

        <span className="ml-1 text-xs text-muted-foreground">
          {resultCount} row{resultCount === 1 ? "" : "s"}
        </span>

        {canAdd && (
          <div className="ml-auto inline-flex h-9">
            <Button
              data-testid={WORKSHEET.addRowBtn}
              onClick={onAddRow}
              size="sm"
              disabled={bulkAdding}
              className={`h-9 bg-indigo-600 text-white hover:bg-indigo-700 ${
                onBulkAdd ? "rounded-r-none" : ""
              }`}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {bulkAdding ? "Adding rows..." : "Add row"}
            </Button>

            {onBulkAdd && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={bulkAdding}
                    aria-label="Add multiple rows"
                    className="h-9 rounded-l-none border-l border-indigo-500 bg-indigo-600 px-2 text-white hover:bg-indigo-700"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {[1, 5, 10, 20].map((count) => (
                    <DropdownMenuItem
                      key={count}
                      onClick={() =>
                        count === 1 ? onAddRow() : onBulkAdd(count)
                      }
                    >
                      Add {count} row{count === 1 ? "" : "s"}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
      </div>
    </div>
  );
};