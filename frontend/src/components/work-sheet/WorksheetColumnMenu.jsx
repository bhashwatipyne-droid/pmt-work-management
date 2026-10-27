import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  EyeOff,
  Filter,
  Snowflake,
  WrapText,
  X,
} from "lucide-react";

// Column-level actions:
// Sort → Filter → Hide
//
// Global/multi-column filtering continues to live in
// WorksheetFilterPanel.jsx.

export const WorksheetColumnMenu = ({
  column,
  isSorted = false,
  isFiltered = false,
  onSortAsc,
  onSortDesc,
  onHide,
  isFrozen = false,
  onFreeze,
  onUnfreeze,
  isWrapped = false,
  onToggleWrap,
  filterControl,
  onClearFilter,
}) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    maxHeight: 520,
  });

  const ref = useRef(null);
  const triggerRef = useRef(null);

  const isActive = isSorted || isFiltered;

  const updateMenuPosition = () => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    // Anchor to the header cell, not the small arrow button, so the menu
    // opens right under the column title and never covers it.
    const headRect =
      triggerRef.current.closest("th, [role='columnheader']")?.getBoundingClientRect() || rect;
    const menuWidth = 380;
    const gap = 2;
    const padding = 8;

    // Like a spreadsheet: the menu's left edge lines up with the column's
    // left edge and it opens towards the right. Only when that would run off
    // the screen does it shift left.
    let left = headRect.left;
    if (left + menuWidth > window.innerWidth - padding) {
      left = window.innerWidth - menuWidth - padding;
    }
    left = Math.max(padding, left);

    // Always directly below the header. A short screen gets a scrollable menu
    // (maxHeight) instead of the menu being pushed up over the column title.
    const top = headRect.bottom + gap;
    const maxHeight = Math.max(160, window.innerHeight - top - padding);

    // Same values -> same state object is not guaranteed, so skip no-op sets.
    setMenuPosition((current) =>
      current.top === top && current.left === left && current.maxHeight === maxHeight
        ? current
        : { top, left, maxHeight }
    );
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        ref.current &&
        !ref.current.contains(event.target) &&
        !event.target.closest("[data-worksheet-column-menu]")
      ) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    updateMenuPosition();

    // Position is set when the menu opens and only recomputed on a window
    // resize. It used to follow every scroll event on the page, including the
    // ones fired when applying a filter re-laid out the table, which made the
    // open menu slide around under the cursor while someone was ticking boxes.
    const handleReposition = () => {
      updateMenuPosition();
    };

    window.addEventListener("resize", handleReposition);

    return () => {
      window.removeEventListener("resize", handleReposition);
    };
  }, [open]);

  const handleAction = (action) => {
    setOpen(false);
    action?.();
  };

  const menu = open ? (
    <div
      data-worksheet-column-menu
      className="
        fixed z-[9999]
        w-[380px]
        overflow-y-auto
        rounded-lg
        border border-slate-200
        bg-white
        py-1.5
        text-slate-700
        shadow-lg
      "
      style={{
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`,
        maxHeight: `${menuPosition.maxHeight}px`,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {/* SORT */}
      <button
        type="button"
        onClick={() => handleAction(onSortAsc)}
        className="
          flex w-full items-center gap-3
          px-3 py-2
          text-left text-[13px]
          hover:bg-slate-50
        "
      >
        <ArrowDownAZ className="h-4 w-4 shrink-0 text-slate-500" />
        <span>Sort A → Z</span>
      </button>

      <button
        type="button"
        onClick={() => handleAction(onSortDesc)}
        className="
          flex w-full items-center gap-3
          px-3 py-2
          text-left text-[13px]
          hover:bg-slate-50
        "
      >
        <ArrowUpAZ className="h-4 w-4 shrink-0 text-slate-500" />
        <span>Sort Z → A</span>
      </button>

      {/* FILTER */}
      {filterControl && (
        <>
          <div className="my-1.5 border-t border-slate-100" />

          <div className="px-3 pb-2 pt-1">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[13px] font-medium text-slate-700">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                Filter by values
              </span>

              {isFiltered && (
                <button
                  type="button"
                  onClick={() => handleAction(onClearFilter)}
                  className="
                    inline-flex items-center gap-1
                    text-[11px] font-medium
                    text-indigo-600
                    hover:text-indigo-700
                  "
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>

            {filterControl}
          </div>
        </>
      )}

      {/* WRAP */}
      {onToggleWrap && (
        <>
          <div className="my-1.5 border-t border-slate-100" />

          <button
            type="button"
            data-testid="worksheet-column-wrap"
            aria-pressed={isWrapped}
            onClick={() => handleAction(onToggleWrap)}
            className="
              flex w-full items-center gap-3
              px-3 py-2
              text-left text-[13px]
              hover:bg-slate-50
            "
          >
            <WrapText
              className={`h-4 w-4 shrink-0 ${isWrapped ? "text-indigo-600" : "text-slate-500"}`}
            />
            <span>{isWrapped ? "Unwrap text" : "Wrap text"}</span>
          </button>
        </>
      )}

      {/* FREEZE */}
      {(onFreeze || onUnfreeze) && (
        <>
          <div className="my-1.5 border-t border-slate-100" />

          <button
            type="button"
            data-testid="worksheet-column-freeze"
            onClick={() => handleAction(isFrozen ? onUnfreeze : onFreeze)}
            className="
              flex w-full items-center gap-3
              px-3 py-2
              text-left text-[13px]
              hover:bg-slate-50
            "
          >
            <Snowflake className="h-4 w-4 shrink-0 text-slate-500" />
            <span>{isFrozen ? "Unfreeze columns" : "Freeze up to this column"}</span>
          </button>
        </>
      )}

      {/* HIDE */}
      <div className="my-1.5 border-t border-slate-100" />

      <button
        type="button"
        onClick={() => handleAction(onHide)}
        className="
          flex w-full items-center gap-3
          px-3 py-2
          text-left text-[13px]
          hover:bg-slate-50
        "
      >
        <EyeOff className="h-4 w-4 shrink-0 text-slate-500" />
        <span>Hide column</span>
      </button>
    </div>
  ) : null;

  return (
    <div ref={ref} className="relative inline-flex shrink-0">
      {/* Column menu trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();

          if (!open) {
            requestAnimationFrame(updateMenuPosition);
          }

          setOpen((value) => !value);
        }}
        className={`
          inline-flex h-6 w-6 items-center justify-center rounded
          transition-colors
          ${
            isFiltered
              ? "bg-indigo-600 text-white opacity-100 hover:bg-indigo-700"
              : isActive
              ? "text-indigo-600 opacity-100 hover:bg-indigo-50"
              : "text-slate-700 opacity-100 hover:bg-slate-100 hover:text-slate-900"
          }
        `}
        title={`Column options for ${column}`}
        aria-label={`Column options for ${column}`}
      >
        {isFiltered ? (
          <Filter className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-4 w-4" strokeWidth={3} />
        )}
      </button>

      {typeof document !== "undefined" &&
        createPortal(menu, document.body)}
    </div>
  );
};