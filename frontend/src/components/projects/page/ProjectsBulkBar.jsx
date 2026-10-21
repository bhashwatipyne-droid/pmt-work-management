import { PROJECT_STATUSES } from "@/constants/projectPalette";
import { ProjectBulkActionBar } from "@/components/projects/ProjectBulkActionBar";

export function ProjectsBulkBar(ctx) {
  const { canManage, clearSelection, filtered, handleBulkHide, handleBulkStatusChange, handleBulkUnhide, selectAllFiltered, selectedProjects, selectionMode, setDeleteTarget, visibility } = ctx;
  return (
    <>
    {/* Bulk actions (appear once something is selected) */}
    {canManage && selectionMode && (
      <div className="mt-4 shrink-0">
        <ProjectBulkActionBar
          selectedCount={selectedProjects.size}
          totalCount={filtered.length}
          visibility={visibility}
          statuses={PROJECT_STATUSES}
          onSelectAll={selectAllFiltered}
          onHide={handleBulkHide}
          onUnhide={handleBulkUnhide}
          onChangeStatus={handleBulkStatusChange}
          onDelete={() => setDeleteTarget("bulk")}
          onClear={clearSelection}
        />
      </div>
    )}
    </>
  );
}
