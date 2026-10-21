import { WorkSheetTabs } from "@/components/work-sheet/WorkSheetTabs";
import { WorkSheetToolbar } from "@/components/work-sheet/WorkSheetToolbar";
import { WorksheetFilterPanel } from "@/components/work-sheet/WorksheetFilterPanel";

export function WorksheetToolbarArea(ctx) {
  const { activeFilterCount, activeSheet, allGroupsCollapsed, bulkAdding, canAddToActiveSheet, currentMonth, deliverables, filteredItems, filters, filtersOpen, groupBy, handleAddRow, handleBulkAddRows, handleExport, handleGroupByChange, handleToggleCollapseAll, isAdmin, items, loadingFullList, missingDeliverableCount, month, onlyMissing, options, projects, setActiveSheet, setFilters, setFiltersOpen, setHistoryOpen, setMonth, setOnlyMissing, tabCounts, users } = ctx;
  return (
    <>
    <WorkSheetToolbar
      filters={filters}
      setFilters={setFilters}
      options={options}
      onOpenFilters={() => setFiltersOpen((current) => !current)}
      activeFilterCount={activeFilterCount}
      onAddRow={handleAddRow}
      canAdd={canAddToActiveSheet}
      resultCount={filteredItems.length}
      totalCount={tabCounts[activeSheet] ?? items.length}
      missingDeliverableCount={missingDeliverableCount}
      onlyMissing={onlyMissing}
      onToggleMissing={() => setOnlyMissing((current) => !current)}
      loadingFullList={loadingFullList}
      groupBy={groupBy}
      onGroupByChange={handleGroupByChange}
      allCollapsed={allGroupsCollapsed}
      onToggleCollapseAll={handleToggleCollapseAll}
      onExport={handleExport}
      tabs={
        <WorkSheetTabs
          activeSheet={activeSheet}
          onChange={setActiveSheet}
          counts={tabCounts}
        />
      }
      onBulkAdd={isAdmin ? undefined : handleBulkAddRows}
      bulkAdding={bulkAdding}
      onOpenHistory={() => setHistoryOpen(true)}
      month={month}
      onMonthChange={setMonth}
      currentMonth={currentMonth}
    />

    <WorksheetFilterPanel
      open={filtersOpen}
      onClose={() => setFiltersOpen(false)}
      filters={filters}
      setFilters={setFilters}
      options={options}
      projects={projects}
      deliverables={deliverables}
      users={users}
    />
    </>
  );
}
