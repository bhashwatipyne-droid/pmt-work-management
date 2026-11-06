import { ChevronLeft, ChevronRight, Eye, EyeOff, Trash2, ArrowRight } from "lucide-react";

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

// Columns from the redesign (Project · Client · POC · Status · Due ·
// Deliverables), plus a narrow slot for the row menu.
const GRID =
  "grid grid-cols-[minmax(260px,2fr)_minmax(180px,1.2fr)_150px_160px_90px_100px_28px] gap-x-4 items-center";

const MENU_ITEM =
  "flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[12.5px] text-[#11151c] focus:bg-[#f4f5f7]";

export const ProjectListTable = ({
  projects,
  lookalikeTextById,
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
        <div className="min-w-[960px]">
          {/* Header */}
          <div
            className={`${GRID} group h-[38px] border-b border-[#e2e8f0] bg-[#f8fafc] px-5 text-[12px] font-semibold leading-4 text-[#334155]`}
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
            <span>POC</span>
            <span>Status</span>
            <span>Due</span>
            <span>Deliverables</span>
            <span />
          </div>

          {/* Rows */}
          {pageProjects.map((project) => {
            const selected = selectedProjects.has(project.id);
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
                className={`${GRID} group min-h-[52px] cursor-pointer border-b border-[#eaeef4] px-5 py-1.5 transition-colors focus:outline-none ${
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
                  <span className="ml-[10px] flex min-w-0 flex-col pr-4">
                    <span
                      className="truncate text-[14px] font-medium text-[#0f172a]"
                      title={[project.name, project.description].filter(Boolean).join(" · ")}
                    >
                      {project.name}
                    </span>
                    {project.description && (
                      <span className="truncate text-[12px] leading-4 text-[#64748b]">
                        {project.description}
                      </span>
                    )}
                    {lookalikeTextById?.get(project.id) && (
                      <span
                        className="truncate text-[11px] leading-[14px] text-amber-800"
                        title="Similar names confuse people when they log time. Consider renaming one, or add a description."
                      >
                        {lookalikeTextById.get(project.id)}
                      </span>
                    )}
                  </span>
                </span>

                <span className="truncate text-[14px] text-[#334155]" title={project.client_name}>
                  {project.client_name || "—"}
                </span>

                <span className="truncate text-[14px] text-[#334155]" title={project.client_poc}>
                  {project.client_poc || "—"}
                </span>

                <span>
                  <ProjectStatusBadge status={project.status} />
                </span>

                <span className={`text-[14px] ${overdue ? "text-[#b42318]" : "text-[#64748b]"}`}>
                  {project.end_date ? fmtDayMonth(project.end_date) : "—"}
                </span>

                <span className="text-[14px] text-[#334155]">
                  {project.deliverables_count ?? 0}
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