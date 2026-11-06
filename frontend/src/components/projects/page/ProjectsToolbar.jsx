import { Check, ChevronDown, LayoutGrid, List, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ExportIconButton } from "@/components/ui/ExportIconButton";
import { PROJECTS } from "@/constants/testIds";
import { PROJECT_STATUSES, PROJECT_STATUS_STYLE } from "@/constants/projectPalette";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProjectFilterPanel } from "@/components/projects/ProjectFilterPanel";

export function ProjectsToolbar(ctx) {
  const { activeFilterCount, canManage, clearFilters, clientFilter, clientOptions, dateFrom, dateTo, filtersOpen, handleExport, handleVisibilityChange, loading, loadingMore, metrics, pocFilter, pocOptions, projects, search, setClientFilter, setDateFrom, setDateTo, setFiltersOpen, setModalOpen, setPocFilter, setSearch, setSortBy, setStatusFilter, setView, sortBy, sortedFiltered, statusFilter, view, visibility } = ctx;
  return (
    <>
    {/* Title + toolbar - a white band under the top bar, as in the redesign:
        title and counts on the left, Board / List and the solid-blue
        "New project" on the right, then the search and filters. */}
    <div className="-mx-3 -mt-[21px] shrink-0 border-b border-[#eaeef4] bg-white px-3 pb-3 pt-4 md:-mx-5 md:px-5 md:pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[200px] flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold leading-8 tracking-tight text-[#0d1b3e] md:text-2xl">
            Projects
          </h1>
          <span className="text-[13px] text-[#546490]">
            <span data-testid="projects-total-count">{projects.length}{loadingMore ? "+" : ""}</span> total
            {" · "}
            <span data-testid={PROJECTS.metricDueWeek}>{metrics?.due_this_week ?? 0}</span> due this week
            {" · "}
            <span data-testid={PROJECTS.metricRework}>{metrics?.in_rework ?? 0}</span> in rework
            {loadingMore && " · loading the rest…"}
          </span>
        </div>

        {/* Board / List */}
        <div role="radiogroup" aria-label="Layout" className="flex rounded-lg bg-[#f5f6f8] p-0.5">
          {[
            ["chart", "Board", LayoutGrid, PROJECTS.chartViewBtn],
            ["list", "List", List, PROJECTS.listViewBtn],
          ].map(([key, label, Icon, testId]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={view === key}
              data-testid={testId}
              onClick={() => setView(key)}
              className={`flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[#2b2bb5]/20 ${
                view === key
                  ? "bg-white text-[#0d1b3e] shadow-[0_1px_2px_rgba(13,28,61,0.05)]"
                  : "text-[#546490] hover:text-[#0d1b3e]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        {canManage && (
          <button
            type="button"
            data-testid={PROJECTS.newProjectBtn}
            onClick={() => setModalOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[#2b2bb5] px-3.5 text-[13px] font-semibold text-white outline-none transition-colors hover:bg-[#3d3dcc] focus-visible:ring-[3px] focus-visible:ring-[#2b2bb5]/30"
          >
            <Plus className="h-3.5 w-3.5" />
            New project
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {/* Search */}
        <label className="flex h-10 w-full items-center md:h-8 md:w-[320px] md:max-w-full gap-2 rounded-[7px] border border-[#eff0f2] bg-white pl-3 pr-2 focus-within:border-[#2b2bb5] focus-within:ring-[3px] focus-within:ring-[#2b2bb5]/20">
          <Search className="h-3 w-3 shrink-0 text-[#a2aab6]" strokeWidth={2.5} />
          <input
            data-testid={PROJECTS.searchInput}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects or deliverables…"
            className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-[#11151c] outline-none placeholder:text-[#a2aab6]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="text-[#a2aab6] hover:text-[#4a5878]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>

        {/* Status - a menu rather than a native select so the button is
            only as wide as the current choice, as in the design */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid={PROJECTS.statusFilter}
              aria-label="Filter by status"
              className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[7px] border border-[#eff0f2] bg-white pl-3 pr-[10px] text-[13px] text-[#4a5878] outline-none hover:bg-[#f9fafb] focus-visible:ring-[3px] focus-visible:ring-[#2b2bb5]/20"
            >
              {statusFilter && (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: PROJECT_STATUS_STYLE[statusFilter]?.dot }}
                />
              )}
              {statusFilter || "All status"}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={6}
            className="w-48 rounded-[10px] border-[#e7e9ee] p-1 shadow-[0_6px_20px_rgba(17,21,28,0.1)]"
          >
            {["", ...PROJECT_STATUSES].map((s) => (
              <DropdownMenuItem
                key={s || "all"}
                onSelect={() => setStatusFilter(s)}
                className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[13px] text-[#11151c] focus:bg-[#f4f5f7]"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: s ? PROJECT_STATUS_STYLE[s]?.dot : "#c3c8d2" }}
                />
                <span className="flex-1">{s || "All status"}</span>
                {statusFilter === s && <Check className="!h-3.5 !w-3.5 text-[#2b2bb5]" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* More filters + sort (not in the design, kept compact) */}
        <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              data-testid={PROJECTS.filtersButton}
              aria-label="More filters and sorting"
              title="More filters and sorting"
              className={`relative flex h-8 w-8 items-center justify-center rounded-[7px] border bg-white outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[#2b2bb5]/20 ${
                activeFilterCount > 0
                  ? "border-[#2b2bb5] text-[#2b2bb5] bg-[#f0f0fd]"
                  : "border-[#eff0f2] text-[#4a5878] hover:bg-[#f9fafb]"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#2b2bb5] px-1 text-[9.5px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-[360px] rounded-xl border border-slate-200 bg-white p-0 shadow-xl"
          >
            <ProjectFilterPanel
              sortBy={sortBy}
              setSortBy={setSortBy}
              clientFilter={clientFilter}
              setClientFilter={setClientFilter}
              pocFilter={pocFilter}
              setPocFilter={setPocFilter}
              dateFrom={dateFrom}
              dateTo={dateTo}
              setDateFrom={setDateFrom}
              setDateTo={setDateTo}
              visibility={visibility}
              setVisibility={handleVisibilityChange}
              clients={clientOptions}
              pocOptions={pocOptions}
              activeFilterCount={activeFilterCount}
              canFilterVisibility={canManage}
              onClear={clearFilters}
              onClose={() => setFiltersOpen(false)}
            />
          </PopoverContent>
        </Popover>

        {/* Export (icon only) - exports exactly what is listed */}
        <ExportIconButton
          data-testid={PROJECTS.exportBtn}
          onClick={handleExport}
          disabled={loading || sortedFiltered.length === 0}
          className="h-8 w-8 rounded-[7px] border-[#eff0f2] text-[#4a5878] hover:bg-[#f9fafb]"
        />
      </div>
    </div>
    </>
  );
}
