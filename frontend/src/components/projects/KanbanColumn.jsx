import { useState } from "react";
import { Eye } from "lucide-react";

import { STATUS_COLORS } from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";
import { ProjectCard } from "./ProjectCard";
import { KanbanColumn as BaseKanbanColumn } from "@/components/ui/KanbanColumn";

const COLUMN_TESTIDS = {
  Active: PROJECTS.columnActive,
  "Approval Pending": PROJECTS.columnApprovalPending,
  Completed: PROJECTS.columnCompleted,
  "Ready for Invoice": PROJECTS.columnReadyForInvoice,
  "Raised Invoice": PROJECTS.columnRaisedInvoice,
  "On Hold": PROJECTS.columnOnHold,
  Scrapped: PROJECTS.columnScrapped,
};

// How many cards a column renders at first, and how many more each "Show
// more" click adds. Rendering every project at once (800+ in total, roughly
// 40,000 DOM elements) made every click and keystroke on this page take
// hundreds of milliseconds. Counts, "select all", drag-and-drop targets and
// filters still work on the full list - only the DOM is paged.
const INITIAL_VISIBLE = 40;
const VISIBLE_STEP = 40;

export const KanbanColumn = ({
  status,
  projects,
  users,
  onOpenProject,
  selectedProjects,
  onSelectProject,
  onSelectAll,
  allSelected,
  onToggleVisibility,
  onDragOverColumn,
  onDropColumn,
  onDragStartProject,
  onDragEndProject,
  onDragOverProject,
  onDropProject,
  dragOverProjectId,
  isDropTarget = false,
  readOnly = false,
}) => {
  const c = STATUS_COLORS[status];

  const [limit, setLimit] = useState(INITIAL_VISIBLE);
  const shownProjects =
    projects.length > limit ? projects.slice(0, limit) : projects;
  const hiddenCount = projects.length - shownProjects.length;

  return (
    <BaseKanbanColumn
      title={status}
      count={projects.length}
      dotClassName={c?.dot}
      titleClassName={c?.text || "text-foreground"}
      headerAction={
        <div className="flex shrink-0 items-center gap-2">
          {!readOnly && (
          <label
            className="inline-flex shrink-0 items-center gap-2"
            title={
              projects.length === 0
                ? "No projects in this column"
                : allSelected
                  ? "Deselect all projects in this column"
                  : "Select all projects in this column"
            }
          >
            <input
              type="checkbox"
              checked={allSelected}
              disabled={projects.length === 0}
              onChange={() => onSelectAll?.(projects)}
              aria-label={
                allSelected
                  ? `Deselect all ${status} projects`
                  : `Select all ${status} projects`
              }
              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-[#2b2bb5] accent-[#2b2bb5] disabled:cursor-not-allowed disabled:opacity-40"
            />
          </label>
          )}

          <button
            type="button"
            onClick={() => onToggleVisibility?.(status)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#667085] transition-colors hover:bg-[#f0f0fd] hover:text-[#2b2bb5]"
            title={`Hide ${status} column`}
            aria-label={`Hide ${status} column`}
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>
      }
      empty={projects.length === 0 ? (readOnly ? "No projects" : "Drop a project here") : null}
      isDropTarget={isDropTarget}
      onDragOver={readOnly ? undefined : (event) => onDragOverColumn?.(event, status)}
      onDrop={readOnly ? undefined : (event) => onDropColumn?.(event, status)}
    >
      {projects.length > 0 && (
        <div
          data-testid={COLUMN_TESTIDS[status]}
          className="flex flex-col gap-3"
        >
          {shownProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              users={users}
              selected={selectedProjects?.has(project.id)}
              onSelect={onSelectProject}
              onOpen={onOpenProject}
              onDragStart={onDragStartProject}
              onDragEnd={onDragEndProject}
              onDragOver={onDragOverProject}
              onDrop={onDropProject}
              isDragTarget={dragOverProjectId === project.id}
              readOnly={readOnly}
            />
          ))}

          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setLimit((current) => current + VISIBLE_STEP)}
              className="rounded-lg border border-dashed border-border bg-white/70 px-3 py-2 text-xs font-medium text-[#2b2bb5] transition-colors hover:bg-white"
            >
              Show {Math.min(VISIBLE_STEP, hiddenCount)} more ({hiddenCount} not
              shown)
            </button>
          )}
        </div>
      )}
    </BaseKanbanColumn>
  );
};