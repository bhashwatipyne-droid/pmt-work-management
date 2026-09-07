import { useEffect, useRef, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  EyeOff,
  Filter,
} from "lucide-react";

export const WorksheetColumnMenu = ({
  column,
  onSortAsc,
  onSortDesc,
  onFilter,
  onHide,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        title={`Options for ${column}`}
        aria-label={`Options for ${column}`}
      >
        ⋮
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg"
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

          <div className="my-1 border-t border-slate-100" />

          <button
            type="button"
            onClick={() => handleAction(onFilter)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
          >
            <Filter className="h-4 w-4" />
            Filter
          </button>

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