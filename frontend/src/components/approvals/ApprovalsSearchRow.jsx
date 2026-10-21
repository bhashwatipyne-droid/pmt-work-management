import { APPROVALS } from "@/constants/testIds";
import ApprovalsFilterModal from "@/components/approvals/ApprovalsFilterModal";
import { Search } from "lucide-react";

export function ApprovalsSearchRow(ctx) {
  const { activeFilterCount, dateFrom, dateTo, deadlineFilter, handleApplyFilters, projectFilter, projectOptions, search, setSearch, stageFilter, stageOptions } = ctx;
  return (
    <>
    {/* SEARCH + FILTER ROW */}
    <div className="flex items-center gap-2 px-3 py-3 md:px-5">
      <div className="relative min-w-0 flex-1 md:flex-none">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          data-testid={APPROVALS.searchInput}
          placeholder="Search deliverable, project, client..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 w-full rounded-lg border border-slate-200 md:w-64 bg-white pl-8 pr-3 text-sm text-slate-800 outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
        />
      </div>

      <ApprovalsFilterModal
        stages={stageOptions}
        projectOptions={projectOptions}
        initialValues={{ stageFilter, projectFilter, deadlineFilter, dateFrom, dateTo }}
        onApply={handleApplyFilters}
        activeFilterCount={activeFilterCount}
      />
    </div>
    </>
  );
}
