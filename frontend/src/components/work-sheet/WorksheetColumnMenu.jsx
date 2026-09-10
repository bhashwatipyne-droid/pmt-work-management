import { useEffect, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  EyeOff,
  Filter,
  X,
} from "lucide-react";

// Single per-column trigger for sort + a scoped filter for just this
// column + hide. One hover-reveal filter icon (matching Sheets' own
// per-column filter icon) instead of two separate always-visible icons —
// it stays visible and highlighted whenever this column has an active
// sort or filter, so it's always clear what's applied and easy to undo.
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
        title={
          isFiltered ? `${column} filter active` : `Sort or filter ${column}`
        }
        aria-label={
          isFiltered ? `${column} filter active` : `Sort or filter ${column}`
        }
      >
        <Filter className="h-3 w-3" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-md border bg-popover py-1.5 text-popover-foreground shadow-md"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleAction(onSortAsc)}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100"
          >
            <ArrowDownAZ className="h-4 w-4 text-slate-500" />
            Sort A → Z
          </button>

          <button
            type="button"
            onClick={() => handleAction(onSortDesc)}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100"
          >
            <ArrowUpAZ className="h-4 w-4 text-slate-500" />
            Sort Z → A
          </button>

          {filterControl && (
            <>
              <div className="my-1.5 border-t border-slate-100" />

              <div className="px-3 pb-2 pt-1">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
                    <Filter className="h-3.5 w-3.5 text-slate-500" />
                    Filter by {column}
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

          <div className="my-1.5 border-t border-slate-100" />

          <button
            type="button"
            onClick={() => handleAction(onHide)}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100"
          >
            <EyeOff className="h-4 w-4 text-slate-500" />
            Hide column
          </button>
        </div>
      )}
    </div>
  );
};