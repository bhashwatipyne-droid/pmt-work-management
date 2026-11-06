import { SORT_OPTIONS } from "@/lib/projectSort";
import { X } from "lucide-react";

export function ProjectsFilterChips(ctx) {
  const { clearFilters, clientFilter, clientOptions, dateFrom, dateTo, handleVisibilityChange, pocFilter, setClientFilter, setDateFrom, setDateTo, setPocFilter, setSearch, setSortBy, sortBy, visibility } = ctx;
  return (
    <>
    {/* Active filter chips (only when something from the filter panel is on) */}
    {(pocFilter || clientFilter || dateFrom || dateTo || visibility !== "visible" || sortBy) && (
      <div className="mt-3 flex shrink-0 flex-wrap items-center gap-1.5">
        {[
          clientFilter && {
            key: "client",
            label: `Client: ${clientOptions.find((c) => c.id === clientFilter)?.name || clientFilter}`,
            clear: () => setClientFilter(""),
          },
          pocFilter && { key: "poc", label: `POC: ${pocFilter}`, clear: () => setPocFilter("") },
          (dateFrom || dateTo) && {
            key: "due",
            label: `Due: ${dateFrom || "Any"} – ${dateTo || "Any"}`,
            clear: () => {
              setDateFrom("");
              setDateTo("");
            },
          },
          visibility !== "visible" && {
            key: "vis",
            label: visibility === "hidden" ? "Hidden projects" : "All projects",
            clear: () => handleVisibilityChange("visible"),
          },
          sortBy && {
            key: "sort",
            label: `Sorted: ${SORT_OPTIONS.find((o) => o.value === sortBy)?.label || sortBy}`,
            clear: () => setSortBy(""),
          },
        ]
          .filter(Boolean)
          .map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.clear}
              className="inline-flex h-6 items-center gap-1 rounded-full border border-[#dce6fe] bg-[#f4f7ff] px-2.5 text-[11.5px] font-medium text-[#1d4ed8]"
            >
              {chip.label}
              <X className="h-3 w-3" />
            </button>
          ))}
        <button
          type="button"
          onClick={() => {
            clearFilters();
            setSearch("");
          }}
          className="ml-1 text-[11.5px] font-medium text-[#3b6ef6] hover:underline"
        >
          Clear all
        </button>
      </div>
    )}
    </>
  );
}
