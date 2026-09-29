import { ChevronLeft, ChevronRight, Eye, EyeOff, Trash2, ArrowRight } from "lucide-react";

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
  ProjectStatusBadge,
  fmtDayMonth,
  isProjectOverdue,
  statusStyle,
} from "./projectVisuals";

const PAGE_SIZE = 10;
const STAGES = Object.keys(STAGE_HEX);

// Column widths from the Figma list frame (Campaign · Client · Status ·
// Deliverables · Stages · Deadline), plus a narrow slot for the row menu.
const GRID =
  "grid grid-cols-[minmax(250px,1fr)_195px_167px_125px_204px_145px_28px] items-center";

const MENU_ITEM =
  "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[12.5px] text-[#11151c] focus:bg-[#f4f5f7]";

export const ProjectListTable = ({
  projects,
  selectedProjects,
  // Once anything is selected every row shows its checkbox.
  selectionMode = false,
  onSelectProject,
  onSelectPage,
  onOpenProject,
  onHideProject,
  onUnhideProject,
  onDeleteProject,
  onNewProject,
  page,
  setPage,
  // View-only: no checkboxes, no hide / delete, no "New project" row.
  readOnly = false,
}) => {
  const totalPages = Math.max(1, Math.ceil(projects.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageProjects = projects.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pageIds = pageProjects.map((p) => p.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedProjects.has(id));

  return (
    <div className="overflow-hidden rounded-[10px] border border-[#e7e9ee] bg-white">
      <div className="pmt-hscroll overflow-x-auto">
        <div className="min-w-[1130px]">
          {/* Header */}
          <div
            className={`${GRID} group h-[48px] border-b-2 border-[#edeff3] bg-[#fafbfc] px-[17px] text-[11px] font-medium uppercase leading-[13px] tracking-[0.07em] text-[#98a1af]`}
          >
            <span className="flex items-center gap-2">
              {!readOnly && (
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={() => onSelectPage?.(pageIds, !allPageSelected)}
                  aria-label="Select visible projects"
                  className={`h-3.5 w-3.5 cursor-pointer rounded accent-[#3b6ef6] ${
                    selectionMode ? "" : "hidden group-hover:block"
                  }`}
                />
              )}
              Project
            </span>
            <span>Client</span>
            <span>Status</span>
            <span>Deliverables</span>
            <span className="flex items-center whitespace-nowrap">
              <span className="w-[68px] text-[#3b6ef6]">Content</span>
              <span className="w-[64px] text-[#7c5cf6]">Design</span>
              <span className="w-[64px] text-[#e08a0b]">Animate</span>
            </span>
            <span>Deadline</span>
            <span />
          </div>

          {/* Rows */}
          {pageProjects.map((project) => {
            const selected = selectedProjects.has(project.id);
            const counts = project.stage_counts || {};
            const overdue = isProjectOverdue(project);
            const showCheckbox = !readOnly;

            return (
              <div
                key={project.id}
                data-testid={`${PROJECTS.listRowPrefix}-${project.id}`}
                role="button"
                tabIndex={0}
                onClick={() => onOpenProject?.(project)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpenProject?.(project);
                }}
                className={`${GRID} group h-[47px] cursor-pointer border-b-2 border-[#f2f4f7] px-[17px] transition-colors focus:outline-none ${
                  selected ? "bg-[#f4f7ff]" : "hover:bg-[#fafbfc] focus-visible:bg-[#fafbfc]"
                }`}
              >
                {/* Project: status dot (checkbox on hover) · code · name */}
                <span className="flex min-w-0 items-center">
                  <span className="relative flex h-3.5 w-[7px] shrink-0 items-center">
                    <span
                      className={`h-[7px] w-[7px] rounded-full ${
                        showCheckbox && (selectionMode || selected) ? "invisible" : showCheckbox ? "group-hover:invisible" : ""
                      }`}
                      style={{ background: statusStyle(project.status).dot }}
                    />
                    {showCheckbox && (
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onSelectProject?.(project.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select ${project.name}`}
                        className={`absolute -left-[3.5px] h-3.5 w-3.5 cursor-pointer rounded accent-[#3b6ef6] ${
                          selectionMode || selected ? "" : "hidden group-hover:block"
                        }`}
                      />
                    )}
                  </span>
                  <span className="ml-[10px] truncate pr-4 text-[13.5px] font-semibold text-[#11151c]" title={project.name}>
                    {project.name}
                  </span>
                </span>

                <span className="truncate pr-4 text-[12.5px] text-[#374151]" title={project.client_name}>
                  {project.client_name || "—"}
                </span>

                <span>
                  <ProjectStatusBadge status={project.status} />
                </span>

                <span className="text-[12.5px] font-semibold text-[#374151]">
                  {project.deliverables_count ?? 0}
                </span>

                <span className="flex items-center">
                  {STAGES.map((stage) => {
                    const n = counts[stage] ?? 0;
                    return (
                      <span
                        key={stage}
                        className={`flex items-center gap-1 whitespace-nowrap ${
                          stage === "Content" ? "w-[68px]" : "w-[64px]"
                        }`}
                        title={`${stage} ${n}`}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: n ? STAGE_HEX[stage] : "#e3e6ec" }}
                        />
                        <span
                          className="text-[11px] font-semibold"
                          style={{ color: n ? STAGE_HEX[stage] : "#c3c8d2" }}
                        >
                          {n}
                        </span>
                      </span>
                    );
                  })}
                </span>

                <span className={`text-[12px] ${overdue ? "text-[#b42318]" : "text-[#6b7280]"}`}>
                  {fmtDayMonth(project.end_date)}
                </span>

                {/* Row menu, shown on hover */}
                <span onClick={(e) => e.stopPropagation()} className="flex justify-end">
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`More actions for ${project.name}`}
                        className="flex h-6 w-6 items-center justify-center rounded-[5px] opacity-0 hover:bg-[#eef0f3] focus:opacity-100 focus:outline-none group-hover:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreDots />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      sideOffset={4}
                      className="w-44 rounded-[10px] border-[#e7e9ee] p-1 shadow-[0_6px_20px_rgba(17,21,28,0.1)]"
                    >
                      <DropdownMenuItem className={MENU_ITEM} onSelect={() => onOpenProject?.(project)}>
                        <ArrowRight className="!h-3.5 !w-3.5 text-[#6b7280]" />
                        Open project
                      </DropdownMenuItem>
                      {!readOnly && (
                        <>
                          <DropdownMenuItem
                            className={MENU_ITEM}
                            onSelect={() => (project.hidden ? onUnhideProject : onHideProject)?.(project)}
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
                            onSelect={() => onDeleteProject?.(project)}
                          >
                            <Trash2 className="!h-3.5 !w-3.5" />
                            Delete project
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            );
          })}

          {!readOnly && (
            <button
              type="button"
              onClick={onNewProject}
              className="flex h-[35px] w-full items-center px-[17px] text-[12.5px] text-[#98a1af] transition-colors hover:text-[#3b6ef6]"
            >
              + New project
            </button>
          )}
        </div>
      </div>

      {/* Pagination (not in the design; only shown when there is more than
          one page) */}
      {totalPages > 1 && (
        <div className="flex h-[42px] items-center justify-between border-t-2 border-[#f2f4f7] px-4">
          <span className="text-[12px] text-[#98a1af]">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, projects.length)} of{" "}
            {projects.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage === 1}
              onClick={() => setPage(Math.max(1, safePage - 1))}
              aria-label="Previous page"
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#4b5563] hover:bg-[#f4f5f7] disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-1 text-[12px] font-medium text-[#4b5563]">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage === totalPages}
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              aria-label="Next page"
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#4b5563] hover:bg-[#f4f5f7] disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};