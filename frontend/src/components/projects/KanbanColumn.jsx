import { useState } from "react";
import { EyeOff } from "lucide-react";

import { PROJECTS } from "@/constants/testIds";
import { ProjectCard } from "./ProjectCard";
import { statusStyle } from "./projectVisuals";

const COLUMN_TESTIDS = {
  Active: PROJECTS.columnActive,
  "Approval Pending": PROJECTS.columnApprovalPending,
  Completed: PROJECTS.columnCompleted,
  "Ready for Invoice": PROJECTS.columnReadyForInvoice,
  "Raised Invoice": PROJECTS.columnRaisedInvoice,
  "On Hold": PROJECTS.columnOnHold,
  Scrapped: PROJECTS.columnScrapped,
};

// Column width from the design (the same 4-up grid as the metric cards).
export const COLUMN_WIDTH = 279.5;

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
  lookalikeTextById,
  onOpenProject,
  selectedProjects,
  selectionMode = false,
  onSelectProject,
  onSelectAll,
  allSelected,
  onHideProject,
  onUnhideProject,
  onDeleteProject,
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
  const s = statusStyle(status);

  const [limit, setLimit] = useState(INITIAL_VISIBLE);
  const shownProjects =
    projects.length > limit ? projects.slice(0, limit) : projects;
  const hiddenCount = projects.length - shownProjects.length;

  return (
    <div
      onDragOver={readOnly ? undefined : (event) => onDragOverColumn?.(event, status)}
      onDrop={readOnly ? undefined : (event) => onDropColumn?.(event, status)}
      style={{ width: COLUMN_WIDTH, minWidth: COLUMN_WIDTH }}
      className="flex shrink-0 flex-col"
    >
      {/* Header pill */}
      <div
        className="group flex h-[37px] items-center gap-2 rounded-[8px] border pl-3 pr-3"
        style={{ background: s.headBg, borderColor: s.headBorder }}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.dot }} />
        <span
          className="truncate text-[12.5px] font-semibold leading-none"
          style={{ color: s.dot }}
        >
          {status}
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {selectionMode && !readOnly && projects.length > 0 && (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onSelectAll?.(projects)}
              aria-label={allSelected ? `Deselect all ${status} projects` : `Select all ${status} projects`}
              className="h-3.5 w-3.5 cursor-pointer rounded accent-[#3b6ef6]"
            />
          )}
          <button
            type="button"
            onClick={() => onToggleVisibility?.(status)}
            title={`Hide ${status} column`}
            aria-label={`Hide ${status} column`}
            className="hidden h-5 w-5 items-center justify-center rounded text-[#98a1af] hover:bg-white/70 hover:text-[#4b5563] focus-visible:flex group-hover:flex"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
          <span
            className="text-[11.5px] font-medium leading-none"
            style={{ color: s.dot, opacity: 0.75 }}
          >
            {projects.length}
          </span>
        </span>
      </div>

      {/* Cards */}
      <div
        data-testid={COLUMN_TESTIDS[status]}
        className={`mt-[7px] flex min-h-[200px] flex-1 flex-col gap-[7px] rounded-[10px] transition-colors ${
          isDropTarget ? "bg-[#eef1f6]" : ""
        }`}
      >
        {shownProjects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            lookalikeText={lookalikeTextById?.get(project.id)}
            selected={selectedProjects?.has(project.id)}
            selectionMode={selectionMode}
            onSelect={onSelectProject}
            onOpen={onOpenProject}
            onHide={onHideProject}
            onUnhide={onUnhideProject}
            onDelete={onDeleteProject}
            onDragStart={onDragStartProject}
            onDragEnd={onDragEndProject}
            onDragOver={onDragOverProject}
            onDrop={onDropProject}
            isDragTarget={dragOverProjectId === project.id}
            readOnly={readOnly}
          />
        ))}

        {projects.length === 0 && (
          <div className="flex h-[120px] items-center justify-center rounded-[10px] border border-dashed border-[#dde1e7] text-[12px] text-[#98a1af]">
            {readOnly ? "No projects" : "Drop a project here"}
          </div>
        )}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setLimit((current) => current + VISIBLE_STEP)}
            className="h-9 rounded-[10px] border border-dashed border-[#dde1e7] bg-white/60 text-[12px] font-medium text-[#3b6ef6] hover:bg-white"
          >
            Show {Math.min(VISIBLE_STEP, hiddenCount)} more ({hiddenCount} not shown)
          </button>
        )}
      </div>
    </div>
  );
};
