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
  History,
  SlidersHorizontal,
  Search,
  AlertCircle,
  ArrowUpDown,
  Check,
  X,
} from "lucide-react";
import { WORKSHEET } from "@/constants/testIds";
import { MonthPicker } from "./MonthPicker";
import { ExportIconButton } from "../ui/ExportIconButton";

// Group-by options for the table. "None" turns grouping off and falls
// back to the existing flat, sorted row list.
const GROUP_OPTIONS = ["Stage", "Member", "None"];

const SEARCH_DEBOUNCE_MS = 160;

// Control styles from the redesign (Mint): 32px, 7px radius, a 1px neutral ring
// instead of a coloured outline. Primary actions are solid brand blue and the
// quieter ones (History) are "secondary gray".
const CONTROL =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[7px] bg-white px-2.5 text-[13px] font-medium text-[#4a5878] shadow-[inset_0_0_0_1px_#eff0f2] outline-none transition-colors hover:bg-[#f9fafb] focus-visible:ring-[3px] focus-visible:ring-[#2b2bb5]/20";
const SECONDARY_GRAY =
  "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[7px] bg-[#f5f6f8] px-3.5 text-[13px] font-semibold text-[#4a5878] shadow-[inset_0_0_0_1px_#eff0f2] outline-none transition-colors hover:bg-[#eef0f3] focus-visible:ring-[3px] focus-visible:ring-[#2b2bb5]/20";
const PRIMARY =
  "h-8 rounded-[7px] px-3.5 text-[13px] font-semibold bg-[#2b2bb5] text-white hover:bg-[#3d3dcc] active:bg-[#3d3dcc]";

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
        className="h-8 w-full rounded-[7px] border-[#eff0f2] pl-9 pr-9 text-[13px] shadow-none"
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
  onOpenHistory,
  // Month stepper in the header. Omit `onMonthChange` and it is not shown.
  // `month` is "YYYY-MM", or "" for every month.
  month = "",
  onMonthChange,
  currentMonth,
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
  // The sheet tabs (All / Content / Design / Animation). The redesign puts them
  // between the title row and the filter row, so they are drawn from here.
  tabs,
  // Icon-only Export next to the row count. Omit `onExport` and it is not
  // shown, so dropping this file in does not require the page change first.
  onExport,
}) => {
  const showGroupControl = Boolean(groupBy && onGroupByChange);
  const showCollapseControl = Boolean(
    onToggleCollapseAll && groupBy && groupBy !== "None"
  );

  return (
    <div className="border-b border-[#eaeef4] bg-white">
      {/* TITLE + PRIMARY ACTIONS ROW
          (Bulk review is no longer here - it lives in the top bar.) */}
      <div className="flex flex-wrap items-center gap-3 px-5 pb-3 pt-5">
        <h1 className="min-w-[160px] flex-1 text-2xl font-semibold tracking-tight text-[#0d1b3e]">
          {title}
        </h1>

        {onMonthChange && (
          <MonthPicker
            value={month}
            onChange={onMonthChange}
            currentMonth={currentMonth}
          />
        )}

        {onOpenHistory && (
          <button type="button" onClick={onOpenHistory} className={SECONDARY_GRAY}>
            <History className="h-3.5 w-3.5" />
            History
          </button>
        )}

        {canAdd && (
          <div className="inline-flex h-8">
            <Button
              data-testid={WORKSHEET.addRowBtn}
              onClick={onAddRow}
              size="sm"
              disabled={bulkAdding}
              className={`${PRIMARY} ${onBulkAdd ? "rounded-r-none" : ""}`}
            >
              <Plus className="h-3.5 w-3.5" />
              {bulkAdding ? "Adding rows..." : "Add row"}
            </Button>

            {onBulkAdd && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    disabled={bulkAdding}
                    aria-label="Add multiple rows"
                    className={`${PRIMARY} rounded-l-none border-l border-white/20 px-2`}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
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

      {tabs}

      {/* SEARCH / FILTER / GROUP ROW */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-2.5">
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
                CONTROL,
                onlyMissing
                  ? "!bg-[#fff5f5] !text-[#991b1b] !shadow-[inset_0_0_0_1px_#ef4444]"
                  : "",
              ].join(" ")}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {missingDeliverableCount} missing a deliverable
            </button>
          ) : (
            <span className={CONTROL}>
              <AlertCircle className="h-3.5 w-3.5" />
              {missingDeliverableCount} missing a deliverable
            </span>
          ))}

        <button
          type="button"
          onClick={onOpenFilters}
          className={[
            CONTROL,
            activeFilterCount > 0
              ? "!bg-[#f0f0fd] !text-[#1a1a8a] !shadow-[inset_0_0_0_1px_#9090ec]"
              : "",
          ].join(" ")}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filter
          {activeFilterCount > 0 && (
            <span className="ml-0.5 rounded-full bg-[#2b2bb5] px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
              {activeFilterCount}
            </span>
          )}
        </button>

        {showGroupControl && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={CONTROL}>
                <ArrowUpDown className="h-3.5 w-3.5" />
                Group: {groupBy}
              </button>
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
          <button
            type="button"
            onClick={onToggleCollapseAll}
            className="inline-flex h-8 items-center rounded-[7px] px-2.5 text-[13px] font-medium text-[#4a5878] outline-none transition-colors hover:bg-[#f9fafb] focus-visible:ring-[3px] focus-visible:ring-[#2b2bb5]/20"
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-[#546490]">
            {loadingFullList && (
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2b2bb5]" />
                Loading full list…
              </span>
            )}
            {totalCount != null
              ? `${resultCount.toLocaleString("en-IN")} of ${totalCount.toLocaleString("en-IN")} rows`
              : `${resultCount} row${resultCount === 1 ? "" : "s"}`}
          </span>

          {onExport && (
            <ExportIconButton
              data-testid={WORKSHEET.exportBtn}
              onClick={onExport}
              disabled={resultCount === 0}
              className="h-8 w-8 rounded-[7px] border-[#eff0f2] text-[#4a5878] hover:bg-[#f9fafb]"
            />
          )}
        </div>
      </div>
    </div>
  );
};