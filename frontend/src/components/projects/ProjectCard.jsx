import { memo } from "react";
import { ArrowRight, Eye, EyeOff, Phone, SquareCheck, Trash2 } from "lucide-react";

import { STAGE_HEX, clientDotColor } from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreDots,
  ProjectStatusBadge,
  fmtDayMonth,
  isProjectOverdue,
  statusStyle,
} from "./projectVisuals";

const STAGES = Object.keys(STAGE_HEX);

// Two rows of unit squares fit a card (12 per row); beyond that the last
// slot says how many more there are.
const MAX_SQUARES = 24;

const MENU_ITEM =
  "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[12.5px] text-[#11151c] focus:bg-[#f4f5f7]";

// memo(): the board can hold hundreds of cards, and everything on the page
// (opening a modal, typing in search, ticking a checkbox, dragging) re-renders
// the page component. With memo a card only re-renders when its own props
// change - which is why the handlers passed in must be stable (see
// ProjectsPage) and receive the project instead of being fresh closures.
const ProjectCardBase = ({
  project,
  onOpen,
  selected = false,
  // Once anything is selected every card shows its checkbox.
  selectionMode = false,
  onSelect,
  onHide,
  onUnhide,
  onDelete,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isDragTarget = false,
  // View-only: no selection, no dragging, no hide/delete.
  readOnly = false,
}) => {
  const s = statusStyle(project.status);
  const handleOpen = () => onOpen?.(project);

  const counts = project.stage_counts || {};
  const squares = STAGES.flatMap((stage) =>
    Array.from({ length: counts[stage] ?? 0 }, () => STAGE_HEX[stage])
  );
  const overflow = squares.length > MAX_SQUARES;
  const shownSquares = overflow ? squares.slice(0, MAX_SQUARES - 1) : squares;
  const overdue = isProjectOverdue(project);

  return (
    <div
      data-testid={`${PROJECTS.cardPrefix}-${project.id}`}
      draggable={!readOnly}
      onDragStart={(event) => onDragStart?.(event, project)}
      onDragEnd={onDragEnd}
      onDragOver={(event) => onDragOver?.(event, project)}
      onDrop={(event) => onDrop?.(event, project)}
      className={[
        "relative w-full rounded-[10px] border bg-white px-[18px] pb-3 pt-4 text-left transition-shadow",
        // Off-screen cards skip layout and paint until scrolled near.
        "[content-visibility:auto] [contain-intrinsic-size:auto_262px]",
        readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
        selected || isDragTarget ? "border-[#3b6ef6]" : "border-[#e7e9ee]",
        isDragTarget ? "ring-2 ring-[#cfddfc]" : "hover:shadow-[0_2px_8px_rgba(17,21,28,0.06)]",
      ].join(" ")}
    >
      {/* 3px status edge, 1px in from the border, as in the design */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-px left-px top-px w-[3px] rounded-l-[8px]"
        style={{ background: s.dot }}
      />

      {/* Code · status · more */}
      <div className="flex h-[22px] items-center gap-[10px]">
        {!readOnly && selectionMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect?.(project.id)}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            className="-mr-1 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-[#c3c8d2] accent-[#3b6ef6]"
            aria-label={`Select ${project.name}`}
          />
        )}
        <span className="truncate text-[11px] leading-none text-[#98a1af]">
          {project.code}
        </span>
        <ProjectStatusBadge status={project.status} />

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              draggable={false}
              aria-label={`More actions for ${project.name}`}
              className="ml-auto flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] hover:bg-[#f4f5f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#cfddfc]"
            >
              <MoreDots />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={4}
            className="w-44 rounded-[10px] border-[#e7e9ee] p-1 shadow-[0_6px_20px_rgba(17,21,28,0.1)]"
          >
            <DropdownMenuItem className={MENU_ITEM} onSelect={handleOpen}>
              <ArrowRight className="!h-3.5 !w-3.5 text-[#6b7280]" />
              Open project
            </DropdownMenuItem>
            {!readOnly && (
              <>
                <DropdownMenuItem className={MENU_ITEM} onSelect={() => onSelect?.(project.id)}>
                  <SquareCheck className="!h-3.5 !w-3.5 text-[#6b7280]" />
                  {selected ? "Deselect" : "Select"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={MENU_ITEM}
                  onSelect={() => (project.hidden ? onUnhide : onHide)?.(project)}
                >
                  {project.hidden ? (
                    <Eye className="!h-3.5 !w-3.5 text-[#6b7280]" />
                  ) : (
                    <EyeOff className="!h-3.5 !w-3.5 text-[#6b7280]" />
                  )}
                  {project.hidden ? "Unhide project" : "Hide project"}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="my-1 bg-[#f0f2f5]" />
                <DropdownMenuItem
                  className={`${MENU_ITEM} !text-[#b42318] focus:!bg-[#fef3f2]`}
                  onSelect={() => onDelete?.(project)}
                >
                  <Trash2 className="!h-3.5 !w-3.5" />
                  Delete project
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Name */}
      <button
        type="button"
        draggable={false}
        onClick={handleOpen}
        className="mt-[13px] block w-full text-left text-[15px] font-bold leading-[18px] text-[#11151c] line-clamp-2 hover:text-[#3b6ef6]"
      >
        {project.name}
      </button>

      {/* Client */}
      <div className="mt-[6px] flex items-center gap-[7px]">
        <span
          className="h-[6px] w-[6px] shrink-0 rounded-[2px]"
          style={{ background: clientDotColor(project.client_name) }}
        />
        <span className="truncate text-[12.5px] leading-[15px] text-[#6b7280]">
          {project.client_name || "—"}
        </span>
      </div>

      {/* POC */}
      <div className="mt-[5px] flex items-center gap-[6px]">
        <Phone className="h-3 w-3 shrink-0 text-[#98a1af]" strokeWidth={2} />
        <span className="truncate text-[12px] leading-[15px] text-[#6b7280]">
          {project.client_poc || "Unassigned"}
        </span>
      </div>

      {/* One square per deliverable, coloured by its current stage. Two
          rows tall at least, filled from the bottom, so the legend sits at
          the same height on every card. */}
      <div className="mt-[13px] flex min-h-[36px] flex-wrap content-end gap-1">
        {shownSquares.map((color, i) => (
          <span
            key={i}
            className="h-4 w-4 rounded-[4px]"
            style={{ background: color }}
          />
        ))}
        {overflow && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-[4px] bg-[#f0f2f5] px-1 text-[9.5px] font-semibold text-[#6b7280]">
            +{squares.length - shownSquares.length}
          </span>
        )}
      </div>

      {/* Stage legend */}
      <div className="mt-[10px] flex flex-wrap gap-x-[10px] gap-y-1">
        {STAGES.map((stage) => {
          const n = counts[stage] ?? 0;
          return (
            <span key={stage} className="flex items-center gap-[5px]">
              <span
                className="h-[9px] w-[9px] rounded-[2px]"
                style={{ background: n ? STAGE_HEX[stage] : "#dde1e7" }}
              />
              <span
                className={`text-[10.5px] leading-[13px] ${
                  n ? "font-medium text-[#4b5563]" : "text-[#a9b0bd]"
                }`}
              >
                {stage} {n}
              </span>
            </span>
          );
        })}
      </div>

      <div className="mt-3 h-[2px] bg-[#f0f2f5]" />

      {/* Deadline · Open */}
      <div className="mt-[9px] flex h-7 items-center justify-between">
        <span
          className={`text-[12px] ${overdue ? "text-[#b42318]" : "text-[#6b7280]"}`}
          title={overdue ? "Past its deadline" : undefined}
        >
          {fmtDayMonth(project.end_date)}
        </span>

        <button
          type="button"
          draggable={false}
          onClick={handleOpen}
          className="inline-flex shrink-0 items-center gap-[3px] text-[12.5px] font-semibold text-[#3b6ef6] hover:text-[#1d4ed8]"
        >
          Open
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
};

export const ProjectCard = memo(ProjectCardBase);
