import { Eye } from "lucide-react";
import { KanbanColumn } from "@/components/projects/KanbanColumn";
import { PROJECTS } from "@/constants/testIds";
import { ProjectListTable } from "@/components/projects/ProjectListTable";
import { ProjectsBoardSkeleton, SettingsTableSkeleton } from "@/components/skeletons/Skeletons";

export function ProjectsContent(ctx) {
  const { boardWidth, byStatus, canManage, dragOverProjectId, dragOverStatus, filtered, handleHideProject, handleUnhideProject, hiddenStatuses, listPage, loading, loadingMore, lookalikeTextById, projects, searchPending, selectPage, selectedProjects, selectionMode, setDeleteTarget, setListPage, setModalOpen, sortedFiltered, stableColumnDragOver, stableColumnDrop, stableDeleteProject, stableDragEnd, stableDragOver, stableDragStart, stableDrop, stableHideProject, stableOpenProject, stableSelectColumn, stableSelectProject, stableToggleColumn, stableUnhideProject, toggleColumnVisibility, toggleProjectSelection, view, visibleStatuses } = ctx;
  return (
    <>
    {/* Content: fills the rest of the page's fixed height (the flex column
        above is capped by AppLayout's <main overflow-hidden>) and scrolls
        on its own, so this never needs to guess the toolbar's height with
        a "100vh - Npx" constant - it just gets whatever space is left.
        The list sits 1px lower than the board, per the design. */}
    <div
      className={`min-h-0 flex-1 overflow-auto ${view === "list" ? "mt-[17px]" : "mt-4"}`}
    >
      {loading || (filtered.length === 0 && searchPending) ? (
        view === "chart" ? (
          <ProjectsBoardSkeleton />
        ) : (
          <SettingsTableSkeleton columns={7} rows={9} label="Loading projects" />
        )
      ) : filtered.length === 0 ? (
        <div
          data-testid={PROJECTS.emptyState}
          className="rounded-[10px] border border-dashed border-[#dde1e7] bg-white py-16 text-center"
        >
          <p className="text-[13px] font-semibold text-[#11151c]">
            {projects.length === 0 ? "No projects yet" : "No projects match these filters"}
          </p>
          {canManage && projects.length === 0 && (
            <p className="mt-1 text-[12px] text-[#6b7280]">
              Click "+ New project" to create your first one.
            </p>
          )}
        </div>
      ) : view === "chart" ? (
        <>
          {hiddenStatuses.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[11.5px] text-[#98a1af]">Hidden columns:</span>
              {hiddenStatuses.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleColumnVisibility(status)}
                  className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[#e1e4ea] bg-white px-2.5 text-[11.5px] font-medium text-[#4b5563] hover:border-[#cfddfc] hover:text-[#1d4ed8]"
                >
                  <Eye className="h-3 w-3" />
                  {status}
                </button>
              ))}
            </div>
          )}

          {/* Horizontal scroll only - the board's own height is whatever
              its tallest column needs; the Content wrapper above supplies
              the vertical scrollbar, at the page's actual available
              height rather than a guessed one. */}
          <div className="pmt-hscroll overflow-x-auto pb-4 max-md:snap-x max-md:snap-mandatory">
            <div className="flex items-start gap-[10px]" style={{ minWidth: boardWidth }}>
              {visibleStatuses.map((status) => {
                const columnProjects = byStatus[status] || [];
                const allColumnProjectsSelected =
                  columnProjects.length > 0 &&
                  columnProjects.every((project) => selectedProjects.has(project.id));

                return (
                  <KanbanColumn
                    key={status}
                    status={status}
                    projects={columnProjects}
                    lookalikeTextById={lookalikeTextById}
                    selectedProjects={selectedProjects}
                    selectionMode={selectionMode}
                    onSelectProject={stableSelectProject}
                    onSelectAll={stableSelectColumn}
                    allSelected={allColumnProjectsSelected}
                    onOpenProject={stableOpenProject}
                    onHideProject={stableHideProject}
                    onUnhideProject={stableUnhideProject}
                    onDeleteProject={stableDeleteProject}
                    onToggleVisibility={stableToggleColumn}
                    onDragStartProject={stableDragStart}
                    onDragEndProject={stableDragEnd}
                    onDragOverProject={stableDragOver}
                    onDropProject={stableDrop}
                    onDragOverColumn={stableColumnDragOver}
                    onDropColumn={stableColumnDrop}
                    dragOverProjectId={dragOverProjectId}
                    isDropTarget={dragOverStatus === status}
                    readOnly={!canManage || loadingMore}
                  />
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <ProjectListTable
          projects={sortedFiltered}
          lookalikeTextById={lookalikeTextById}
          selectedProjects={selectedProjects}
          selectionMode={selectionMode}
          onSelectProject={toggleProjectSelection}
          onSelectPage={selectPage}
          onOpenProject={stableOpenProject}
          onHideProject={handleHideProject}
          onUnhideProject={handleUnhideProject}
          onDeleteProject={(p) => setDeleteTarget(p)}
          onNewProject={() => setModalOpen(true)}
          page={listPage}
          setPage={setListPage}
          readOnly={!canManage || loadingMore}
        />
      )}
    </div>
    </>
  );
}
