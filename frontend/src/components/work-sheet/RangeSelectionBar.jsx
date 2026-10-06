import { useEffect, useRef, useState } from "react";
import { Check, ChevronUp, Copy, X } from "lucide-react";
import { formatMinutes } from "@/lib/quantity";

const STAT_KEY = "worksheet_range_stat";

const STATUS_DOT = {
  "Not Started": "bg-slate-400",
  Ongoing: "bg-amber-500",
  "On Hold": "bg-purple-500",
  "Ready for Review": "bg-blue-500",
  "Changes Requested": "bg-rose-400",
  Rework: "bg-rose-500",
  Closed: "bg-emerald-500",
  Scrap: "bg-red-600",
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const readStat = () => {
  try {
    return localStorage.getItem(STAT_KEY) || "count";
  } catch {
    return "count";
  }
};

// Small bar pinned to the bottom-left of the window while a block of cells is
// selected: how many cells, and one figure the user picks (count, filled,
// empty, unique values, and time totals when the Time column is in the block).
export const RangeSelectionBar = ({ stats, left, onCopy, onClear }) => {
  const [pick, setPick] = useState(readStat);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef(null);

  const times = stats?.times || [];
  const sum = times.reduce((a, b) => a + b, 0);
  const options = stats
    ? [
        ["count", "Count", plural(stats.count, "cell")],
        ["filled", "Filled", `${stats.filled} of ${stats.count}`],
        ["empty", "Empty", String(stats.empty)],
        ["unique", "Unique values", String(stats.unique)],
        ...(times.length
          ? [
              ["sum", "Sum of time", formatMinutes(sum)],
              ["avg", "Average time", formatMinutes(sum / times.length)],
            ]
          : []),
      ]
    : [];
  const current = options.find(([key]) => key === pick) || options[0];

  // Outside click or Esc closes the menu (Esc must not also clear the selection).
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [menuOpen]);

  if (!stats || !current) return null;

  const choose = (key) => {
    setPick(key);
    setMenuOpen(false);
    try {
      localStorage.setItem(STAT_KEY, key);
    } catch {
      // Remembering the choice is a convenience only.
    }
  };

  return (
    <div
      ref={rootRef}
      data-testid="worksheet-range-bar"
      className="fixed bottom-4 z-[45] flex items-center gap-0.5 rounded-lg bg-white py-1 pl-1 pr-1 text-xs text-slate-700 shadow-[0_6px_20px_rgba(13,28,61,0.18)] ring-1 ring-slate-200"
      style={{ left }}
    >
      {menuOpen && (
        <div
          role="menu"
          className="absolute bottom-full left-0 mb-2 w-60 rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgb(234,238,244),0_6px_25px_rgba(13,28,61,0.15)]"
        >
          {options.map(([key, label, value]) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={key === current[0]}
              onClick={() => choose(key)}
              className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] hover:bg-slate-100"
            >
              <Check className={`h-3.5 w-3.5 ${key === current[0] ? "text-[#2b2bb5]" : "opacity-0"}`} />
              <span className="flex-1">{label}</span>
              <span className="tabular-nums text-slate-500">{value}</span>
            </button>
          ))}

          {stats.statusCounts.length > 0 && (
            <div className="mt-1 border-t border-slate-100 pt-1.5">
              <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Status
              </p>
              {stats.statusCounts.map(([status, count]) => (
                <div key={status} className="flex h-7 items-center gap-2 px-2 text-[13px]">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status] || "bg-slate-400"}`} />
                  <span className="flex-1">{status}</span>
                  <span className="tabular-nums text-slate-500">{count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        title="Choose what to show"
        className="flex h-7 items-center gap-1.5 rounded-md px-2 font-semibold tabular-nums text-slate-900 hover:bg-slate-100"
      >
        {current[1]}: {current[2]}
        <ChevronUp className="h-3 w-3 text-slate-400" />
      </button>

      <span className="whitespace-nowrap px-1.5 text-slate-500">
        {plural(stats.rows, "row")} × {plural(stats.cols, "column")}
      </span>

      <button
        type="button"
        onClick={onCopy}
        title="Copy (Ctrl/⌘ C)"
        aria-label="Copy selected cells"
        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onClear}
        title="Clear selection (Esc)"
        aria-label="Clear selection"
        className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
