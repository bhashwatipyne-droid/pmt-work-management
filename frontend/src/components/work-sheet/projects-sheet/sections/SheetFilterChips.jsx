import { C } from "@/components/work-sheet/projects-sheet/sheetTheme";
import { Filter, X } from "lucide-react";

export function SheetFilterChips(ctx) {
  const { activeFields, clearFilters, filters, query, setFilterMenu, setFilters } = ctx;
  return (
    <>
    {(activeFields.length > 0 || query) && (
      <div
        className="flex flex-wrap items-center gap-1.5 px-3 py-2 md:px-5"
        style={{ background: C.n50, boxShadow: `inset 0 -1px 0 ${C.cellLine}` }}
      >
        {activeFields.map((f) => {
          const vals = filters[f.key];
          const shown = vals.map((x) => (f.key === "follow" ? (x === "Due" ? "Due by this day" : x) : x));
          return (
            <div
              key={f.key}
              className="flex h-7 items-center overflow-hidden rounded-[7px] bg-white text-[12px]"
              style={{ boxShadow: `inset 0 0 0 1px ${C.b200}` }}
            >
              <button
                type="button"
                onClick={() => setFilterMenu(f.key)}
                className="flex h-full items-center gap-1 pl-2.5 pr-1.5 hover:bg-[#f0f0fd]"
              >
                <Filter className="h-3 w-3 text-[#2b2bb5]" />
                <span className="text-[#4a5878]">{f.label}</span>
                <span className="text-[#546490]">{vals.length > 1 ? "is any of" : "is"}</span>
                <span className="font-semibold text-[#1a1a8a]">
                  {shown.length > 2 ? `${shown.slice(0, 2).join(", ")} +${shown.length - 2}` : shown.join(", ")}
                </span>
              </button>
              <button
                type="button"
                aria-label="Remove"
                onClick={() => setFilters((cur) => ({ ...cur, [f.key]: [] }))}
                className="flex h-full w-[26px] items-center justify-center text-[#546490] hover:bg-[#f0f0fd] hover:text-[#1a1a8a]"
                style={{ boxShadow: `inset 1px 0 0 ${C.b100}` }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={clearFilters}
          className="h-7 px-2 text-[12px] font-medium text-[#546490] hover:text-[#0d1b3e]"
        >
          Clear all
        </button>
      </div>
    )}
    </>
  );
}
