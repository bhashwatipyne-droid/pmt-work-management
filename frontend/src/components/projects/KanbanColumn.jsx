import { useState } from "react";
import { EyeOff } from "lucide-react";

import { PROJECTS } from "@/constants/testIds";
import { ProjectCard } from "./ProjectCard";
import { columnTint } from "./projectVisuals";

const COLUMN_TESTIDS = {
  Active: PROJECTS.columnActive,
  "Approval Pending": PROJECTS.columnApprovalPending,
  Completed: PROJECTS.columnCompleted,
  "Ready for Invoice": PROJECTS.columnReadyForInvoice,
  "Raised Invoice": PROJECTS.columnRaisedInvoice,
  "On Hold": PROJECTS.columnOnHold,
  Scrapped: PROJECTS.columnScrapped,
};

// Column width and gap from the redesign.
export const COLUMN_WIDTH = 320;
export const COLUMN_GAP = 14;

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
  const t = columnTint(status);

  const [limit, setLimit] = useState(INITIAL_VISIBLE);
  const shownProjects =
    projects.length > limit ? projects.slice(0, limit) : projects;
  const hiddenCount = projects.length - shownProjects.length;

  return (
    <section
      aria-label={status}
      onDragOver={readOnly ? undefined : (event) => onDragOverColumn?.(event, status)}
      onDrop={readOnly ? undefined : (event) => onDropColumn?.(event, status)}
      style={{
        width: COLUMN_WIDTH,
        minWidth: COLUMN_WIDTH,
        background: t.tint,
        boxShadow: `inset 0 0 0 1px ${t.edge}`,
      }}
      className="flex shrink-0 flex-col rounded-[14px] px-[10px] pb-[10px] max-md:snap-start"
    >
      {/* Header. Sticky: the board scrolls vertically inside its own box
          (ProjectsContent), so the status and count stay in view while a
          long column scrolls. The wrapper carries the column tint so cards
          slide under it cleanly. */}
      <div className="sticky top-0 z-10 rounded-t-[14px] pb-[10px] pt-[10px]" style={{ background: t.tint }}>
      <div
        className="group flex h-11 items-center gap-[10px] rounded-[10px] px-3"
        style={{ background: t.head, boxShadow: `inset 0 0 0 1px ${t.edge}` }}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.dot }} />
        <span
          className="min-w-0 flex-1 truncate text-[14px] font-bold leading-none"
          style={{ color: t.ink }}
        >
          {status}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
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
            className="hidden h-6 w-6 items-center justify-center rounded text-[#64748b] hover:bg-white/70 hover:text-[#334155] focus-visible:flex group-hover:flex"
          >
            <EyeOff className="h-3.5 w-3.5" />
          </button>
          <span
            className="h-6 min-w-[28px] rounded-full bg-white px-[9px] text-center text-[13px] font-bold leading-6"
            style={{ color: t.ink, boxShadow: `inset 0 0 0 1px ${t.edge}` }}
          >
            {projects.length}
          </span>
        </span>
      </div>
      </div>

      {/* Cards */}
      <div
        data-testid={COLUMN_TESTIDS[status]}
        className={`flex min-h-[120px] flex-1 flex-col gap-[10px] rounded-[10px] p-0.5 transition-colors ${
          isDropTarget ? "bg-white/60" : ""
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
          <div
            className="flex min-h-[110px] flex-col items-center justify-center gap-1 rounded-[10px] border-[1.5px] border-dashed p-3 text-center text-[13px] text-[#64748b]"
            style={{ borderColor: t.edge }}
          >
            <span className="font-semibold text-[#334155]">No projects here</span>
            <span className="text-[12px]">
              {readOnly ? "Nothing in this stage yet" : "Drop a project here"}
            </span>
          </div>
        )}

        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setLimit((current) => current + VISIBLE_STEP)}
            style={{ borderColor: t.edge }}
            className="h-9 rounded-[10px] border border-dashed bg-white/60 text-[12px] font-medium text-[#3b6ef6] hover:bg-white"
          >
            Show {Math.min(VISIBLE_STEP, hiddenCount)} more ({hiddenCount} not shown)
          </button>
        )}
      </div>
    </section>
  );
};
