import { useEffect, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  EyeOff,
  Filter,
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
    <div ref={ref} className="relative inline-flex shrink-0">
      {/* Column menu trigger */}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
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
              : "text-slate-400 opacity-0 group-hover/header:opacity-100 hover:bg-slate-100 hover:text-slate-700"
          }
        `}
        title={`Column options for ${column}`}
        aria-label={`Column options for ${column}`}
      >
        {isFiltered ? (
          <Filter className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>

      {open && (
        <div
          className="
            absolute right-0 top-full z-50 mt-1
            w-[280px]
            overflow-hidden
            rounded-lg
            border border-slate-200
            bg-white
            py-1.5
            text-slate-700
            shadow-lg
          "
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
      )}
    </div>
  );
};