import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, ListChecks } from "lucide-react";
import { STAGE_COLORS } from "@/constants/projectPalette";
import { NOT_AVAILABLE_LABEL } from "@/lib/deliverableRules";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { focusAdjacentCell } from "./useWorksheetKeyboardNavigation";

const NO_IDS = [];

// Work Sheet Deliverable cell for a Campaign Ideation Plan row. Ideation is done
// in bulk, so one row can cover several of the project's deliverables: this is a
// tick list instead of the usual pick-one list. Clicking a deliverable ticks or
// unticks it and the list stays open until Done. The row's Qty is the number
// ticked, and each one gets its own time in the Qty panel.
//
// Ticks are kept here while the list is open and handed to `onCommit` once when
// it closes (Done, Esc, click away, Tab), so ticking ten deliverables is one
// save, not ten. "Not available" stays as the last choice, as in the pick-one
// list; it replaces the ticks.
export function DeliverableMultiPicker({
  options = [],
  selectedIds = NO_IDS,
  notAvailable = false,
  missing = false,
  placeholder = "Deliverable",
  emptyText = "No deliverables for this project",
  showNotAvailable = true,
  disabled = false,
  open = false,
  onOpenChange,
  onCommit,
  triggerProps = {},
  "data-testid": testId,
}) {
  const [search, setSearch] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [draftIds, setDraftIds] = useState(selectedIds);
  const [draftNotAvailable, setDraftNotAvailable] = useState(notAvailable);
  const draftRef = useRef({ ids: selectedIds, notAvailable });
  const savedRef = useRef({ ids: selectedIds, notAvailable });
  const wasOpenRef = useRef(false);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const triggerRef = useRef(null);
  const leavingByTabRef = useRef(false);
  savedRef.current = { ids: selectedIds, notAvailable };

  const setDraft = (ids, na) => {
    draftRef.current = { ids, notAvailable: na };
    setDraftIds(ids);
    setDraftNotAvailable(na);
  };

  // On open start from what is saved; on close save what was ticked.
  useLayoutEffect(() => {
    if (open) setDraft(savedRef.current.ids, savedRef.current.notAvailable);
    if (wasOpenRef.current && !open) {
      const next = draftRef.current;
      const saved = savedRef.current;
      if (next.ids.join("|") !== saved.ids.join("|") || next.notAvailable !== saved.notAvailable) {
        onCommit?.(next.ids, next.notAvailable);
      }
    }
    wasOpenRef.current = open;
    // Only when the list opens or closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) setSearch("");
    else setHighlight(0);
  }, [open]);

  const ticks = open ? draftIds : selectedIds;
  const na = open ? draftNotAvailable : notAvailable;
  const tickSet = useMemo(() => new Set(ticks.map(String)), [ticks]);

  const byId = useMemo(() => new Map(options.map((o) => [String(o.id), o])), [options]);
  const selected = selectedIds.map((id) => byId.get(String(id))).filter(Boolean);

  const shown = useMemo(() => {
    const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return options;
    return options.filter((o) => {
      const haystack = [o.name, o.current_stage, o.stage_status].filter(Boolean).join(" ").toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [options, search]);

  // The "Not available" row sits after the deliverables and can be highlighted
  // like them.
  const rowCount = shown.length + (showNotAvailable ? 1 : 0);

  useEffect(() => {
    setHighlight((h) => Math.min(h, Math.max(0, rowCount - 1)));
  }, [rowCount]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-option-index="${highlight}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [highlight]);

  const close = () => onOpenChange?.(false);

  const toggle = (id) => {
    const { ids } = draftRef.current;
    setDraft(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id], false);
  };

  const toggleNotAvailable = () => {
    const next = !draftRef.current.notAvailable;
    setDraft(next ? [] : draftRef.current.ids, next);
  };

  const activate = (index) => {
    if (index < shown.length) toggle(shown[index].id);
    else toggleNotAvailable();
  };

  const tickAllShown = () => {
    const { ids } = draftRef.current;
    const merged = [...ids];
    shown.forEach((o) => {
      if (!merged.includes(o.id)) merged.push(o.id);
    });
    setDraft(merged, false);
  };

  const handleTriggerKeyDown = (event) => {
    triggerProps.onKeyDown?.(event);
    if (event.defaultPrevented || disabled || open || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      setSearch(event.key);
      onOpenChange?.(true);
    }
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setHighlight((h) => Math.max(0, Math.min(rowCount - 1, h + (event.key === "ArrowDown" ? 1 : -1))));
      return;
    }

    // Left / Right with nothing typed: close and step to the neighbouring cell.
    if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      !search &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      leavingByTabRef.current = true;
      close();
      focusAdjacentCell(triggerRef.current, event.key === "ArrowLeft" ? -1 : 1, false);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      leavingByTabRef.current = true;
      close();
      focusAdjacentCell(triggerRef.current, event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (rowCount > 0) activate(highlight);
      return;
    }

    if (event.key === "Escape") {
      event.stopPropagation();
      return; // Radix closes the popover and returns focus to the cell.
    }

    // Everything else is typing in the search box.
    event.stopPropagation();
  };

  const first = selected[0];
  const extra = Math.max(0, selectedIds.length - 1);

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && onOpenChange?.(next)}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          {...triggerProps}
          data-testid={testId}
          disabled={disabled}
          onKeyDown={handleTriggerKeyDown}
          title={selected.length ? selected.map((o) => o.name).join(", ") : undefined}
          className="flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 py-[5px] text-left text-[13px] leading-5 outline-none"
        >
          <span className="min-w-0 flex-1 truncate">
            {first ? (
              first.name
            ) : notAvailable ? (
              <span className="font-medium text-amber-700">{NOT_AVAILABLE_LABEL}</span>
            ) : missing ? (
              <span className="text-rose-500">Required</span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </span>
          {extra > 0 && (
            <span
              data-testid="worksheet-deliverable-extra-count"
              className="shrink-0 rounded-full bg-[#f0f0fd] px-1.5 text-[11px] font-semibold leading-4 text-[#1a1a8a]"
            >
              +{extra}
            </span>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[460px] max-w-[calc(100vw-16px)] p-1.5"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          const input = inputRef.current;
          if (!input) return;
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }}
        onCloseAutoFocus={(event) => {
          if (leavingByTabRef.current) {
            leavingByTabRef.current = false;
            event.preventDefault();
          }
        }}
      >
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlight(0);
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search deliverables"
          aria-label="Search deliverables"
          className="h-8 w-full rounded-md border border-input px-2 text-[13px] outline-none focus:border-[#2b2bb5]"
        />

        <div
          data-testid="worksheet-deliverable-multi-banner"
          className="mt-1.5 flex items-center gap-2 rounded-lg bg-[#f0f0fd] px-2.5 py-2"
        >
          <ListChecks className="h-3.5 w-3.5 shrink-0 text-[#2b2bb5]" />
          <span className="min-w-0 flex-1 text-xs font-semibold leading-4 text-[#1a1a8a]">
            Campaign ideation · multi-select
            <br />
            <span className="font-normal text-slate-700">
              {ticks.length
                ? `${ticks.length} ${ticks.length === 1 ? "deliverable" : "deliverables"} ticked · Qty ${ticks.length}`
                : na
                  ? NOT_AVAILABLE_LABEL
                  : "Tick every deliverable this ideation covers"}
            </span>
          </span>
          {shown.length > 1 && (
            <button
              type="button"
              data-testid="worksheet-deliverable-tick-all"
              onMouseDown={(e) => e.preventDefault()}
              onClick={tickAllShown}
              className="h-7 rounded-[7px] px-2 text-xs font-semibold text-slate-700 hover:bg-white"
            >
              {search.trim() ? "Tick shown" : "Tick all"}
            </button>
          )}
          {(ticks.length > 0 || na) && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setDraft([], false)}
              className="h-7 rounded-[7px] px-2 text-xs font-semibold text-slate-700 hover:bg-white"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            data-testid="worksheet-deliverable-multi-done"
            onMouseDown={(e) => e.preventDefault()}
            onClick={close}
            className="h-7 rounded-[7px] bg-[#2b2bb5] px-3 text-xs font-semibold text-white hover:bg-[#1a1a8a]"
          >
            Done
          </button>
        </div>

        <div ref={listRef} role="listbox" aria-multiselectable="true" className="mt-1 flex max-h-[320px] flex-col gap-px overflow-y-auto">
          {shown.map((option, index) => {
            const ticked = tickSet.has(String(option.id));
            const dot = STAGE_COLORS[option.current_stage]?.dot || "bg-slate-300";
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={ticked}
                data-option-index={index}
                data-testid={`worksheet-deliverable-option-${option.id}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => toggle(option.id)}
                onMouseEnter={() => setHighlight(index)}
                className={`flex min-h-8 shrink-0 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-foreground ${
                  index === highlight ? "bg-[#f0f0fd]" : ""
                }`}
              >
                <span
                  role="checkbox"
                  aria-checked={ticked}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] ${
                    ticked ? "bg-[#2b2bb5] text-white" : "bg-white shadow-[inset_0_0_0_1.5px_#cbd5e1]"
                  }`}
                >
                  {ticked && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span title={option.current_stage} className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                <span className="min-w-0 flex-1 whitespace-normal break-words leading-[18px]">{option.name}</span>
                {option.stage_status && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-px text-[11px] font-medium leading-4 text-slate-600">
                    {option.stage_status}
                  </span>
                )}
              </button>
            );
          })}

          {shown.length === 0 && (
            <span className="p-2 text-xs text-muted-foreground">
              {search.trim() ? "No deliverable matches." : emptyText}
            </span>
          )}

          {showNotAvailable && (
            <button
              type="button"
              role="option"
              aria-selected={na}
              data-option-index={shown.length}
              data-testid="worksheet-deliverable-option-not-available"
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleNotAvailable}
              onMouseEnter={() => setHighlight(shown.length)}
              className={`mt-1 flex min-h-8 shrink-0 items-center gap-2 rounded-md border-t border-border px-2.5 py-1.5 text-left text-[13px] ${
                highlight === shown.length ? "bg-[#f0f0fd]" : ""
              }`}
            >
              <span
                role="checkbox"
                aria-checked={na}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] ${
                  na ? "bg-[#2b2bb5] text-white" : "bg-white shadow-[inset_0_0_0_1.5px_#cbd5e1]"
                }`}
              >
                {na && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="font-medium text-amber-700">{NOT_AVAILABLE_LABEL}</span>
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
