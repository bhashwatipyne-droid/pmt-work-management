import { memo } from "react";

import {
  STAGE_COLORS,
  STATUS_COLORS,
} from "@/constants/projectPalette";

import { PROJECTS } from "@/constants/testIds";

import {
  ArrowRight,
  Building2,
  GripVertical,
  User as UserIcon,
} from "lucide-react";

const fmtDate = (iso) => {
  if (!iso) return "—";

  try {
    const d = new Date(iso);

    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
};

// memo(): the board can hold hundreds of cards, and everything on the page
// (opening a modal, typing in search, ticking a checkbox, dragging) re-renders
// the page component. Without memo every one of those re-rendered and
// re-diffed every card. With it a card only re-renders when its own props
// change - which is why the handlers passed in must be stable (see
// ProjectsPage) and `onOpen` receives the project instead of being a fresh
// closure per card.
const ProjectCardBase = ({
  project,
  onOpen,
  selected = false,
  onSelect,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isDragTarget = false,
  // View-only: no selection checkbox, no drag handle, no dragging.
  readOnly = false,
}) => {
  const status =
    STATUS_COLORS[project.status] || STATUS_COLORS.Active;

  const poc = project.client_poc;

  const handleOpen = () => onOpen?.(project);

  return (
    <div
      data-testid={`${PROJECTS.cardPrefix}-${project.id}`}
      draggable={!readOnly}
      onDragStart={(event) => onDragStart?.(event, project)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOver?.(event, project)}
      onDrop={(event) => onDrop?.(event, project)}
      className={[
        "w-full rounded-xl border bg-white p-4 text-left transition-all",
        // Off-screen cards skip layout and paint until scrolled near; the
        // intrinsic size keeps the scrollbar stable in the meantime.
        "[content-visibility:auto] [contain-intrinsic-size:auto_250px]",
        readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        "hover:-translate-y-0.5 hover:border-[#c8c8ee] hover:shadow-md",
        selected
          ? "border-[#aaaaf0] bg-[#fafaff] ring-1 ring-[#d8d8ff]"
          : "border-border",
        isDragTarget ? "border-[#2b2bb5] ring-2 ring-[#d8d8ff]" : "",
      ].join(" ")}
    >
      {/* Selection + drag affordance */}
      <div className="flex items-center justify-between">
        {readOnly ? (
          <span />
        ) : (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect?.(project.id)}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-[#2b2bb5] focus:ring-[#2b2bb5]"
            aria-label={`Select ${project.name}`}
          />
        )}

        <div className="flex items-center gap-2">
          {!readOnly && (
            <GripVertical
              className="h-4 w-4 text-slate-300"
              aria-hidden="true"
            />
          )}
          <span
            className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${status.badge}`}
          >
            {project.status}
          </span>
        </div>
      </div>

      {/* Project name */}
      <button
        type="button"
        draggable={false}
        onClick={handleOpen}
        className="mt-3 block w-full text-left line-clamp-2 text-sm font-semibold leading-5 text-foreground hover:text-[#2b2bb5]"
      >
        {project.name}
      </button>

      {/* Client + POC */}
      <div className="mt-3 space-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 shrink-0" />

          <span className="truncate">
            {project.client_name || "—"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <UserIcon className="h-3.5 w-3.5 shrink-0" />

          <span className="truncate">
            {poc || "Unassigned"}
          </span>
        </div>
      </div>

      {/* Stage counts */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {Object.entries(STAGE_COLORS).map(([stage, c]) => (
          <span
            key={stage}
            className="flex items-center gap-1.5"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${c.dot}`}
            />

            <span
              className={`text-[11px] font-medium ${c.text}`}
            >
              {stage} {project.stage_counts?.[stage] ?? 0}
            </span>
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-end border-t border-border pt-3">
        <span className="text-[11px] text-muted-foreground">
          {fmtDate(project.end_date)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {project.deliverables_count ?? 0} deliverable
          {(project.deliverables_count ?? 0) === 1 ? "" : "s"}
        </span>

        <button
          type="button"
          draggable={false}
          onClick={handleOpen}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#2b2bb5]"
        >
          Open
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};

export const ProjectCard = memo(ProjectCardBase);