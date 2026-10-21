import { MobileWorkList } from "@/components/work-sheet/MobileWorkList";
import { WorkSheetTable } from "@/components/work-sheet/WorkSheetTable";
import { WorkSheetTableSkeleton } from "@/components/skeletons/Skeletons";

export function WorksheetGrid(ctx) {
  const { activeSheet, addingRow, clients, collabIndex, currentUser, deliverables, filteredItems, filters, groupBy, handleAddCollaborators, handleAddRow, handleDateSort, handleDuplicateRow, handleFill, handleSelectRange, handleUpdate, hiddenRows, isAdmin, isPhone, loading, options, projects, pushUndo, searchPending, selectedIds, setAllGroupsCollapsed, setDeleteTarget, setFilters, setHiddenRows, setHideRowsErrorOpen, setSelectedIds, sortDirection, sortedItems, tableRef, toggleSelect, toggleSelectAll, users } = ctx;
  return (
    <>
    {loading || (sortedItems.length === 0 && searchPending) ? (
      <WorkSheetTableSkeleton />
    ) : isPhone ? (
      <MobileWorkList
        items={sortedItems}
        currentUser={currentUser}
        users={users}
        options={options}
        projects={projects}
        deliverables={deliverables}
        clients={clients}
        hiddenRows={hiddenRows}
        onUpdate={handleUpdate}
      />
    ) : (
      <WorkSheetTable
        ref={tableRef}
        items={sortedItems}
        currentUser={currentUser}
        users={users}
        options={options}
        clients={clients}
        projects={projects}
        deliverables={deliverables}
        onUpdate={handleUpdate}
        collabIndex={collabIndex}
        onAddCollaborators={isAdmin ? undefined : handleAddCollaborators}
        onDelete={setDeleteTarget}
        onDuplicateRow={handleDuplicateRow}
        onFill={handleFill}
        onUndoable={pushUndo}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        onDateSort={handleDateSort}
        sortDirection={sortDirection}
        hiddenRows={hiddenRows}
        setHiddenRows={setHiddenRows}
        filters={filters}
        setFilters={setFilters}
        onAddRow={isAdmin ? undefined : handleAddRow}
        addingRow={addingRow}
        onSelectRange={handleSelectRange}
        sheetKey={activeSheet}
        groupBy={groupBy}
        onGroupCollapseStateChange={setAllGroupsCollapsed}
        onRequestHideRow={(rowId) => {
          const visibleIds = filteredItems.map((item) => item.id);

          const wouldHideEveryVisibleRow =
            visibleIds.length === 1 &&
            visibleIds[0] === rowId &&
            !hiddenRows.includes(rowId);

          if (wouldHideEveryVisibleRow) {
            setHideRowsErrorOpen(true);
            return;
          }

          setHiddenRows((current) =>
            current.includes(rowId)
              ? current
              : [...current, rowId]
          );

          if (selectedIds.includes(rowId)) {
            setSelectedIds((current) =>
              current.filter((id) => id !== rowId)
            );
          }
        }}
      />
    )}
    </>
  );
}
