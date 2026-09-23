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
  Clock3,
  ClipboardCheck,
  History,
  SlidersHorizontal,
  Search,
  AlertCircle,
  ArrowUpDown,
  Check,
} from "lucide-react";
import { WORKSHEET } from "@/constants/testIds";
import { CountBadge } from "@/components/ui/CountBadge";

// Group-by options for the table. "None" turns grouping off and falls
// back to the existing flat, sorted row list.
const GROUP_OPTIONS = ["Stage", "Member", "None"];

export const WorkSheetToolbar = ({
  title = "Work sheet",
  filters,
  setFilters,
  options,
  onOpenFilters,
  activeFilterCount = 0,
  onAddRow,
  canAdd,
  resultCount,
  // Optional: unfiltered row count for the current sheet, so the count
  // reads "17 of 3,656 rows" instead of just "17 rows". Falls back to
  // the old wording when not supplied, so this stays a drop-in
  // replacement even before the page passes it through.
  totalCount,
  onBulkAdd,
  bulkAdding,
  onOpenQuickLogger,
  onOpenBulkReview,
  bulkReviewCount = 0,
  onOpenHistory,
  // Purely informational — same isDeliverableMissing rule that already
  // flags individual rows, just surfaced as a toolbar-level count. Not
  // clickable/filterable by design.
  missingDeliverableCount = 0,
  // Grouping is new: only rendered once the page wires up a value +
  // handler. Omit both props and this control disappears entirely, so
  // dropping this file in does not require the grouping work to land
  // first.
  groupBy,
  onGroupByChange,
  allCollapsed = false,
  onToggleCollapseAll,
}) => {
  const showGroupControl = Boolean(groupBy && onGroupByChange);
  const showCollapseControl = Boolean(
    onToggleCollapseAll && groupBy && groupBy !== "None"
  );

  return (
    <div className="border-b border-border bg-card">
      {/* TITLE + PRIMARY ACTIONS ROW */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>

        <div className="flex items-center gap-2">
          {onOpenBulkReview && (
            <Button onClick={onOpenBulkReview} size="sm" variant="outline">
              <ClipboardCheck className="h-4 w-4" />
              Bulk Review
              <CountBadge count={bulkReviewCount} />
            </Button>
          )}

          {/* Temporary placement — this becomes the floating, draggable
              trigger button once the Quick Logger revamp lands. Kept
              here in the meantime so the feature stays reachable. */}
          {onOpenQuickLogger && (
            <Button onClick={onOpenQuickLogger} size="sm" variant="outline">
              <Clock3 className="h-4 w-4" />
              Quick log
            </Button>
          )}

          {onOpenHistory && (
            <Button onClick={onOpenHistory} size="sm" variant="outline">
              <History className="h-4 w-4" />
              History
            </Button>
          )}

          {canAdd && (
            <div className="inline-flex h-[34px]">
              <Button
                data-testid={WORKSHEET.addRowBtn}
                onClick={onAddRow}
                size="sm"
                disabled={bulkAdding}
                className={onBulkAdd ? "rounded-r-none" : ""}
              >
                <Plus className="h-4 w-4" />
                {bulkAdding ? "Adding rows..." : "Add row"}
              </Button>

              {onBulkAdd && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      disabled={bulkAdding}
                      aria-label="Add multiple rows"
                      className="rounded-l-none border-l border-white/20 px-2"
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

      {/* SEARCH / FILTER / GROUP ROW */}
      <div className="flex flex-wrap items-center gap-2 px-6 pb-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <Input
            data-testid={WORKSHEET.searchInput}
            placeholder="Search deliverable, client, project, or remarks..."
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

        {missingDeliverableCount > 0 && (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-medium text-amber-800">
            <AlertCircle className="h-3.5 w-3.5" />
            {missingDeliverableCount} missing a deliverable
          </span>
        )}

        <Button
          type="button"
          variant={activeFilterCount > 0 ? "default" : "outline"}
          size="sm"
          onClick={onOpenFilters}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-0.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
              {activeFilterCount}
            </span>
          )}
        </Button>

        {showGroupControl && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm">
                <ArrowUpDown className="h-4 w-4" />
                Group: {groupBy}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {GROUP_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option}
                  onClick={() => onGroupByChange(option)}
                  className="justify-between"
                >
                  {option}
                  {groupBy === option && <Check className="h-4 w-4" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {showCollapseControl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleCollapseAll}
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {totalCount != null
            ? `${resultCount} of ${totalCount} rows`
            : `${resultCount} row${resultCount === 1 ? "" : "s"}`}
        </span>
      </div>
    </div>
  );
};