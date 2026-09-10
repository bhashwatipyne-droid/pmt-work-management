import { useEffect, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  EyeOff,
  X,
} from "lucide-react";

// Single per-column trigger for sort + a scoped filter for just this
// column + hide. Replaces what used to be two separate always-visible
// icons (a filter funnel and a "⋮" menu) — now there's one hover-reveal
// control, matching a spreadsheet's per-column dropdown, and it stays
// visible (highlighted) whenever this column has an active sort or
// filter so you can always see — and undo — what's applied without
// having to hover to find it again.
export const WorksheetColumnMenu = ({
  column,
  isSorted = false,
  isFiltered = false,
  onSortAsc,
  onSortDesc,
  onHide,
  filterControl,
  onClearFilter,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const isActive = isSorted || isFiltered;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleAction = (action) => {
    setOpen(false);
    action?.();
  };

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition-opacity ${
          isActive
            ? "bg-indigo-600 text-white opacity-100 hover:bg-indigo-700"
            : "text-slate-400 opacity-0 hover:bg-slate-100 hover:text-slate-700 group-hover/header:opacity-100"
        }`}
        title={`Options for ${column}`}
        aria-label={`Options for ${column}`}
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleAction(onSortAsc)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            <ArrowDownAZ className="h-4 w-4" />
            Sort A → Z
          </button>

          <button
            type="button"
            onClick={() => handleAction(onSortDesc)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            <ArrowUpAZ className="h-4 w-4" />
            Sort Z → A
          </button>

          {filterControl && (
            <>
              <div className="my-1 border-t border-slate-100" />

              <div className="px-3 py-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Filter {column}
                  </span>

                  {isFiltered && (
                    <button
                      type="button"
                      onClick={() => handleAction(onClearFilter)}
                      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
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

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            onClick={() => handleAction(onHide)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
          >
            <EyeOff className="h-4 w-4" />
            Hide column
          </button>
        </div>
      )}
    </div>
  );
};