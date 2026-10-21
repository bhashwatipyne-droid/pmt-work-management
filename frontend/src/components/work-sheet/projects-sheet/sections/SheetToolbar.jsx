import { C, MENU, MENU_ITEM, MENU_LABEL } from "@/components/work-sheet/projects-sheet/sheetTheme";
import { Check, ChevronRight, Eye, Filter, LayoutList, Search, X } from "lucide-react";
import { ExportIconButton } from "@/components/ui/ExportIconButton";
import { FIELDS, GROUPS } from "@/components/work-sheet/projects-sheet/sheetColumns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ValuesPanel } from "@/components/work-sheet/projects-sheet/SheetPickers";

export function SheetToolbar(ctx) {
  const { activeFields, allCollapsed, control, exportSheet, filterMenu, filters, groupBy, groups, hiddenCols, hiddenRows, monthCount, query, setCollapsed, setFilterMenu, setFilters, setGroupBy, setHiddenCols, setHiddenRows, setQuery, toggleAll, toggleFilter, valuesFor, visible } = ctx;
  return (
    <>
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2.5 md:px-5"
      style={{ boxShadow: `inset 0 -1px 0 ${C.cellLine}` }}
    >
      <label
        className="flex h-8 min-w-[240px] items-center gap-2 rounded-[7px] bg-white px-2.5 text-[#546490]"
        style={{ ...control, flex: "0 1 320px" }}
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <input
          aria-label="Search work sheet"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQuery("")}
          placeholder="Search task, client, remark"
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#0d1b3e] outline-none placeholder:text-[#8a97b5]"
        />
        {query && (
          <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="flex text-[#546490]">
            <X className="h-4 w-4" />
          </button>
        )}
      </label>

      <Popover open={!!filterMenu} onOpenChange={(o) => setFilterMenu(o ? "fields" : null)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-haspopup="menu"
            className="flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-medium hover:!bg-[#f0f0fd]"
            style={{
              background: activeFields.length ? C.b50 : "#fff",
              color: activeFields.length ? C.b700 : C.n700,
              boxShadow: `inset 0 0 0 1px ${activeFields.length ? C.b200 : C.n200}`,
            }}
          >
            <Filter className="h-3.5 w-3.5" />
            {activeFields.length ? `Filter · ${activeFields.length}` : "Filter"}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={4} className={MENU}>
          {filterMenu === "fields" ? (
            <div className="flex flex-col gap-px p-1.5">
              <div className={MENU_LABEL}>Filter rows by</div>
              {FIELDS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilterMenu(f.key)}
                  className={`${MENU_ITEM} h-[34px]`}
                >
                  <Filter className="h-3.5 w-3.5 text-[#546490]" />
                  <span className="flex-1">{f.label}</span>
                  {filters[f.key]?.length > 0 && (
                    <span className="h-[18px] rounded-full bg-[#2b2bb5] px-1.5 text-[11px] font-semibold leading-[18px] text-white">
                      {filters[f.key].length}
                    </span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-[#8a97b5]" />
                </button>
              ))}
            </div>
          ) : (
            filterMenu && (
              <ValuesPanel
                title={FIELDS.find((f) => f.key === filterMenu).label}
                values={valuesFor(filterMenu)}
                selected={filters[filterMenu] || []}
                onToggle={(v) => toggleFilter(filterMenu, v)}
                onClear={() => setFilters((f) => ({ ...f, [filterMenu]: [] }))}
                onDone={() => setFilterMenu(null)}
                onBack={() => setFilterMenu("fields")}
              />
            )
          )}
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-8 items-center gap-1.5 rounded-[7px] bg-white px-2.5 text-[13px] text-[#4a5878] hover:bg-[#f9fafb]"
            style={control}
          >
            <LayoutList className="h-3.5 w-3.5" />
            Group: {GROUPS.find(([k]) => k === groupBy)[1]}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={4} className={`${MENU} w-[200px]`}>
          <div className="flex flex-col gap-px p-1.5">
            <div className={MENU_LABEL}>Group rows by</div>
            {GROUPS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setGroupBy(k);
                  setCollapsed({});
                }}
                className={MENU_ITEM}
              >
                <span className="flex-1">{label}</span>
                {groupBy === k && <Check className="h-3.5 w-3.5 text-[#2b2bb5]" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {groupBy !== "none" && groups.length > 0 && (
        <button
          type="button"
          onClick={toggleAll}
          className="h-8 rounded-[7px] px-2.5 text-[13px] font-medium text-[#4a5878] hover:bg-[#f9fafb]"
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      )}

      <div className="flex-1" />
      {hiddenCols.length > 0 && (
        <button
          type="button"
          onClick={() => setHiddenCols([])}
          className="flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[12px] font-semibold text-[#2b2bb5] hover:bg-[#f0f0fd]"
        >
          <Eye className="h-3.5 w-3.5" />
          {hiddenCols.length} hidden column{hiddenCols.length === 1 ? "" : "s"} · Show
        </button>
      )}
      {Object.values(hiddenRows).some(Boolean) && (
        <button
          type="button"
          onClick={() => setHiddenRows({})}
          className="flex h-7 items-center gap-1.5 rounded-[7px] px-2 text-[12px] font-semibold text-[#2b2bb5] hover:bg-[#f0f0fd]"
        >
          <Eye className="h-3.5 w-3.5" />
          {Object.values(hiddenRows).filter(Boolean).length} hidden · Show
        </button>
      )}
      <span className="text-[12px] text-[#546490]">
        {visible.length.toLocaleString("en-IN")} of {monthCount.toLocaleString("en-IN")} rows
      </span>
      <ExportIconButton
        onClick={exportSheet}
        disabled={!visible.length}
        className="h-8 w-8 rounded-[7px] border-[#eff0f2] text-[#4a5878] hover:bg-[#f9fafb]"
      />
    </div>
    </>
  );
}
