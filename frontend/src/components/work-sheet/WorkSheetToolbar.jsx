import { useEffect, useRef, useState } from "react";
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
  ClipboardCheck,
  History,
  SlidersHorizontal,
  Search,
  AlertCircle,
  ArrowUpDown,
  Check,
  X,
} from "lucide-react";
import { WORKSHEET } from "@/constants/testIds";
import { CountBadge } from "@/components/ui/CountBadge";

// Group-by options for the table. "None" turns grouping off and falls
// back to the existing flat, sorted row list.
const GROUP_OPTIONS = ["Stage", "Member", "None"];

const SEARCH_DEBOUNCE_MS = 160;

const isEditableTarget = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.("role");
  return role === "combobox" || role === "textbox";
};

// Search box for the sheet.
//  - Typing is debounced, so filtering thousands of rows doesn't run on
//    every keystroke; clearing is instant.
//  - "/" focuses it from anywhere on the page (when not typing elsewhere).
//  - Esc clears the text, or leaves the box if it is already empty.
//  - Several words all have to match (any order, across deliverable,
//    client, project, type, owner and remarks) - see WorkSheetPage.
const SearchBox = ({ value, onChange }) => {
  const [text, setText] = useState(value || "");
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  // Stay in step when something else changes the search (Clear filters,
  // a palette result, a pinned project).
  useEffect(() => {
    setText(value || "");
  }, [value]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const commit = (next) => {
    clearTimeout(timerRef.current);
    onChange(next);
  };

  const handleChange = (event) => {
    const next = event.target.value;
    setText(next);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(next), SEARCH_DEBOUNCE_MS);
  };

  const clear = () => {
    setText("");
    commit("");
    inputRef.current?.focus();
  };

  return (
    <div className="relative min-w-[220px] max-w-[400px] flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

      <Input
        ref={inputRef}
        type="text"
        data-testid={WORKSHEET.searchInput}
        aria-label="Search work sheet"
        title="Matches every word you type, in any order, across deliverable, client, project, type, owner and remarks"
        placeholder="Search deliverable, client, project…"
        value={text}
        onChange={handleChange}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commit(text);
          } else if (event.key === "Escape") {
            event.preventDefault();
            if (text) clear();
            else inputRef.current?.blur();
          }
        }}
        className="h-9 w-full pl-9 pr-9"
      />

      {text ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={clear}
          className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden h-5 -translate-y-1/2 items-center rounded px-1.5 text-[10px] font-semibold text-slate-400 shadow-[inset_0_0_0_1px_rgba(226,232,240,1)] sm:inline-flex">
          /
        </kbd>
      )}
    </div>
  );
};

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
  onOpenBulkReview,
  bulkReviewCount = 0,
  onOpenHistory,
  // Purely informational — same isDeliverableMissing rule that already
  // flags individual rows, just surfaced as a toolbar-level count. Not
  // clickable/filterable by design.
  missingDeliverableCount = 0,
  // When both are supplied the "N missing a deliverable" chip becomes a
  // toggle that shows only those rows.
  onlyMissing = false,
  onToggleMissing,
  // True while the full dataset is still loading in behind a fast
  // initial slice — shown next to the row count so it's clear why
  // counts might tick up shortly after the page first paints.
  loadingFullList = false,
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
        <SearchBox
          value={filters.search}
          onChange={(next) =>
            setFilters((f) => (f.search === next ? f : { ...f, search: next }))
          }
        />

        {(missingDeliverableCount > 0 || onlyMissing) &&
          (onToggleMissing ? (
            <button
              type="button"
              data-testid="worksheet-missing-toggle"
              aria-pressed={onlyMissing}
              onClick={onToggleMissing}
              title={
                onlyMissing
                  ? "Showing only rows missing a deliverable — click to show all"
                  : "Show only rows missing a deliverable"
              }
              className={[
                "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
                onlyMissing
                  ? "border-amber-400 bg-amber-100 text-amber-900 ring-1 ring-amber-300"
                  : "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
              ].join(" ")}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {missingDeliverableCount} missing a deliverable
            </button>
          ) : (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 text-xs font-medium text-amber-800">
              <AlertCircle className="h-3.5 w-3.5" />
              {missingDeliverableCount} missing a deliverable
            </span>
          ))}

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

        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          {loadingFullList && (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2b2bb5]" />
              Loading full list…
            </span>
          )}
          {totalCount != null
            ? `${resultCount} of ${totalCount} rows`
            : `${resultCount} row${resultCount === 1 ? "" : "s"}`}
        </span>
      </div>
    </div>
  );
};