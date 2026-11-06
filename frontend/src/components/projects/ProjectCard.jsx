import { memo, useEffect, useRef, useState } from "react";
import { dismissLookalike } from "@/lib/lookalikeDismiss";
import { AlertCircle, ArrowRight, CalendarDays, Eye, EyeOff, Receipt, SquareCheck, Trash2, User, X } from "lucide-react";

import { STAGE_HEX } from "@/constants/projectPalette";
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
  clientInitials,
  clientTile,
  fmtDayMonth,
  isProjectOverdue,
  statusStyle,
} from "./projectVisuals";

const STAGES = Object.keys(STAGE_HEX);

const MENU_ITEM =
  "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[12.5px] text-[#11151c] focus:bg-[#f4f5f7]";

// memo(): the board can hold hundreds of cards, and everything on the page
// (opening a modal, typing in search, ticking a checkbox, dragging) re-renders
// the page component. With memo a card only re-renders when its own props
// change - which is why the handlers passed in must be stable (see
// ProjectsPage) and receive the project instead of being fresh closures.
const ProjectCardBase = ({
  project,
  // "Looks like <other project>" when the name is easy to confuse.
  lookalikeText,
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

  // The whole card opens the project on click. Clicks that come from the
  // checkbox / menu are ignored, and so are clicks from the dropdown menu
  // (it renders in a portal but React still bubbles its events up to the
  // card - it is not a DOM descendant, which is what we test for).
  const handleCardClick = (event) => {
    if (!event.currentTarget.contains(event.target)) return;
    if (event.target.closest("button, input, a, [role='menuitem']")) return;
    handleOpen();
  };

  // Pointer by default (the card is a link); the grab hand only appears once
  // the mouse has been held down for a moment, i.e. when a drag is starting.
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef(null);
  const clearHold = () => {
    clearTimeout(holdTimer.current);
    setHolding(false);
  };
  useEffect(() => () => clearTimeout(holdTimer.current), []);
  const handleMouseDown = (event) => {
    if (readOnly || event.button !== 0) return;
    if (event.target.closest("button, input, a")) return;
    holdTimer.current = setTimeout(() => setHolding(true), 200);
  };

  const counts = project.stage_counts || {};
  const stageMix = STAGES.filter((stage) => (counts[stage] ?? 0) > 0);
  const overdue = isProjectOverdue(project);
  const tile = clientTile(project.client_name || "");
  const deliverables = project.deliverables_count ?? 0;

  return (
    <div
      data-testid={`${PROJECTS.cardPrefix}-${project.id}`}
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && event.key === "Enter") handleOpen();
      }}
      onMouseDown={handleMouseDown}
      onMouseUp={clearHold}
      onMouseLeave={clearHold}
      draggable={!readOnly}
      onDragStart={(event) => {
        clearHold();
        onDragStart?.(event, project);
      }}
      onDragEnd={(event) => {
        clearHold();
        onDragEnd?.(event);
      }}
      onDragOver={(event) => onDragOver?.(event, project)}
      onDrop={(event) => onDrop?.(event, project)}
      style={{
        "--card-edge": s.dot,
        // 4px status edge on the left, as in the redesign.
        boxShadow: `inset 4px 0 0 ${s.dot}, ${
          selected || isDragTarget
            ? "0 0 0 2px #3b6ef6"
            : "0 1px 3px 0 rgba(13,28,61,0.10), 0 0 0 1px rgba(13,28,61,0.04)"
        }`,
      }}
      className={[
        "group/card relative flex w-full flex-col gap-[10px] rounded-[12px] bg-white pb-3 pl-[18px] pr-[14px] pt-[14px] text-left transition-[box-shadow,transform] duration-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#cfddfc]",
        // Off-screen cards skip layout and paint until scrolled near.
        "[content-visibility:auto] [contain-intrinsic-size:auto_200px]",
        holding ? "cursor-grabbing" : "cursor-pointer",
        isDragTarget || selected ? "" : "hover:-translate-y-px hover:!shadow-[inset_4px_0_0_var(--card-edge),0_6px_16px_0_rgba(13,28,61,0.14),0_0_0_1px_#c7d2fe]",
      ].join(" ")}
    >
      {/* Client tile · client · code · more */}
      <div className="flex items-center gap-2">
        {!readOnly && selectionMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onSelect?.(project.id)}
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            className="h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-[#c3c8d2] accent-[#3b6ef6]"
            aria-label={`Select ${project.name}`}
          />
        )}
        <span
          aria-hidden="true"
          className="h-6 w-6 shrink-0 rounded-[7px] text-center text-[11px] font-bold leading-6"
          style={{ background: tile.bg, color: tile.fg }}
        >
          {clientInitials(project.client_name || "")}
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#334155]">
          {project.client_name || "—"}
        </span>
        <span className="shrink-0 text-[11px] font-medium leading-4 text-[#64748b]">
          {project.code || "New"}
        </span>

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              draggable={false}
              onClick={(e) => e.stopPropagation()}
              aria-label={`More actions for ${project.name}`}
              className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] hover:bg-[#f4f5f7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#cfddfc]"
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
      <div className="line-clamp-2 text-[15px] font-bold leading-5 text-[#0f172a] [text-wrap:pretty] group-hover/card:text-[#2b2bb5]">
        {project.name}
      </div>

      {/* Invoice raised (finance has billed it) */}
      {project.status === "Raised Invoice" && (
        <span className="inline-flex items-center gap-1.5 self-start rounded-[8px] bg-[#e0f2fe] px-2.5 py-1 text-[12px] font-bold leading-4 tracking-[0.02em] text-[#075985]">
          <Receipt className="h-[13px] w-[13px]" />
          Invoice raised
        </span>
      )}

      {project.description && (
        <div className="line-clamp-2 text-[13px] leading-[18px] text-[#475569] [text-wrap:pretty]">
          {project.description}
        </div>
      )}

      {lookalikeText && (
        <span
          title="Similar names confuse people when they log time. Consider renaming one, or add a description."
          className="inline-flex max-w-full items-center gap-1 self-start rounded-full bg-amber-100 px-2 py-[3px] text-[11px] font-semibold leading-4 text-amber-800"
        >
          <AlertCircle className="h-3 w-3 shrink-0" />
          <span className="truncate">{lookalikeText}</span>
          <button
            type="button"
            aria-label="Dismiss warning"
            title="Dismiss"
            onClick={(e) => {
              e.stopPropagation();
              dismissLookalike(project.id);
            }}
            className="-mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-amber-200"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      )}

      {/* Deliverables per stage, e.g. "Content 12" "Design 10" */}
      {stageMix.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stageMix.map((stage) => (
            <span
              key={stage}
              className="rounded-[6px] bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold leading-4 text-[#334155]"
            >
              {stage} <span className="text-[#0f172a]">{counts[stage]}</span>
            </span>
          ))}
        </div>
      )}

      {/* Due · POC · deliverables */}
      <div className="flex items-center gap-2 border-t border-[#eef1f6] pt-[10px] text-[12px] text-[#475569]">
        <span
          className={`flex shrink-0 items-center gap-[5px] rounded-[6px] px-2 py-[3px] font-semibold ${
            overdue ? "bg-[#fef3f2] text-[#b42318]" : "bg-[#f1f5f9] text-[#1e293b]"
          }`}
          title={overdue ? "Past its deadline" : undefined}
        >
          <CalendarDays className="h-3 w-3" />
          {project.end_date ? `Due ${fmtDayMonth(project.end_date)}` : "No deadline"}
        </span>
        <span className="flex-1" />
        <span className="flex min-w-0 items-center gap-[5px]" title="Client POC">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{project.client_poc || "—"}</span>
        </span>
        <span className="shrink-0 font-semibold text-[#1e293b]">
          {deliverables} deliv.
        </span>
      </div>
    </div>
  );
};

export const ProjectCard = memo(ProjectCardBase);