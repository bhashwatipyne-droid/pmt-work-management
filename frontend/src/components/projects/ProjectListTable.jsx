import {
  CalendarDays,
  MoreVertical,
  Eye,
  EyeOff,
  Trash2,
  UserRound,
} from "lucide-react";

import {
  STAGE_COLORS,
  STATUS_COLORS,
} from "@/constants/projectPalette";

import { PROJECTS } from "@/constants/testIds";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const PAGE_SIZE = 10;

const fmtDate = (iso) => {
  if (!iso) return "—";

  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

export const ProjectListTable = ({
  projects,
  users,
  selectedProjects,
  onSelectProject,
  onSelectPage,
  onOpenProject,
  onHideProject,
  onUnhideProject,
  onDeleteProject,
  page,
  setPage,
}) => {
  const totalPages = Math.max(
    1,
    Math.ceil(projects.length / PAGE_SIZE)
  );

  const safePage = Math.min(page, totalPages);

  const pageProjects = projects.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  const pageIds = pageProjects.map((p) => p.id);

  const allPageSelected =
    pageIds.length > 0 &&
    pageIds.every((id) => selectedProjects.has(id));

  const togglePage = () => {
    onSelectPage?.(pageIds, !allPageSelected);
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white">
      {/* Sort */}
      <div className="flex items-center justify-end border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Sort by</span>

          <select className="h-9 rounded-lg border border-input bg-white px-3 text-sm font-medium text-foreground">
            <option>Last updated</option>
            <option>Deadline</option>
            <option>Project name</option>
            <option>Status</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] text-left">
          <thead>
            <tr className="border-b border-border bg-[#f7f9fc] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={togglePage}
                  className="h-4 w-4 rounded border-slate-300 text-[#2b2bb5] focus:ring-[#2b2bb5]"
                  aria-label="Select visible projects"
                />
              </th>

              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">POC / Owner</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Due Date</th>

              {["Content", "Design", "Animate", "Finish"].map(
                (stage) => (
                  <th key={stage} className="px-3 py-3">
                    <span className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${STAGE_COLORS[stage].dot}`}
                      />
                      {stage}
                    </span>
                  </th>
                )
              )}

              <th className="w-14 px-3 py-3"> </th>
            </tr>
          </thead>

          <tbody>
            {pageProjects.map((project) => {
              const status =
                STATUS_COLORS[project.status] ||
                STATUS_COLORS["On Hold"];

              const selected = selectedProjects.has(project.id);

              const owner = project.client_poc;

              return (
                <tr
                  key={project.id}
                  data-testid={`${PROJECTS.listRowPrefix}-${project.id}`}
                  className={[
                    "border-b border-border last:border-0 transition-colors",
                    selected
                      ? "bg-[#fafaff]"
                      : "hover:bg-[#fafbff]",
                  ].join(" ")}
                >
                  {/* Checkbox */}
                  <td className="px-4 py-4">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() =>
                        onSelectProject?.(project.id)
                      }
                      className="h-4 w-4 rounded border-slate-300 text-[#2b2bb5] focus:ring-[#2b2bb5]"
                      aria-label={`Select ${project.name}`}
                    />
                  </td>

                  {/* Project */}
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() => onOpenProject?.(project)}
                      className="text-left"
                    >
                      <div className="font-semibold text-foreground hover:text-[#2b2bb5]">
                        {project.name}
                      </div>

                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        {project.code}
                      </div>
                    </button>
                  </td>

                  {/* Client */}
                  <td className="max-w-[180px] px-4 py-4 text-sm text-slate-600">
                    <span className="line-clamp-2">
                      {project.client_name || "—"}
                    </span>
                  </td>

                  {/* Owner */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <UserRound className="h-3.5 w-3.5" />

                      <span className="truncate">
                        {owner || "Unassigned"}
                      </span>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center rounded-md px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${status.badge}`}
                    >
                      {project.status}
                    </span>
                  </td>

                  {/* Due date */}
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <CalendarDays className="h-4 w-4" />

                      <span>{fmtDate(project.end_date)}</span>
                    </div>
                  </td>

                  {/* Stage counts */}
                  {["Content", "Design", "Animate", "Finish"].map(
                    (stage) => (
                      <td key={stage} className="px-3 py-4">
                        <span
                          className={`flex items-center gap-1.5 text-xs font-medium ${STAGE_COLORS[stage].text}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${STAGE_COLORS[stage].dot}`}
                          />
                          {project.stage_counts?.[stage] ?? 0}
                        </span>
                      </td>
                    )
                  )}

                  {/* Actions */}
                  <td className="px-3 py-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`Actions for ${project.name}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            onOpenProject?.(project)
                          }
                        >
                          View project
                        </DropdownMenuItem>

                        {project.hidden ? (
                          <DropdownMenuItem
                            onClick={() =>
                              onUnhideProject?.(project)
                            }
                          >
                            <Eye className="h-4 w-4" />
                            Unhide project
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() =>
                              onHideProject?.(project)
                            }
                          >
                            <EyeOff className="h-4 w-4" />
                            Hide project
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() =>
                            onDeleteProject?.(project)
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-border px-5 py-3">
        <span className="text-xs text-muted-foreground">
          Showing{" "}
          {projects.length === 0
            ? 0
            : (safePage - 1) * PAGE_SIZE + 1}
          –
          {Math.min(safePage * PAGE_SIZE, projects.length)} of{" "}
          {projects.length} projects
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={safePage === 1}
            onClick={() => setPage(Math.max(1, safePage - 1))}
            className="h-8 w-8 rounded-md border border-border text-sm disabled:opacity-40"
          >
            ‹
          </button>

          {Array.from(
            { length: Math.min(totalPages, 5) },
            (_, index) => index + 1
          ).map((number) => (
            <button
              key={number}
              type="button"
              onClick={() => setPage(number)}
              className={[
                "h-8 min-w-8 rounded-md px-2 text-sm",
                number === safePage
                  ? "border border-[#c9c9f2] bg-[#f0f0fd] font-semibold text-[#2b2bb5]"
                  : "text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              {number}
            </button>
          ))}

          {totalPages > 5 && (
            <>
              <span className="px-1 text-slate-400">...</span>

              <button
                type="button"
                onClick={() => setPage(totalPages)}
                className="h-8 min-w-8 rounded-md px-2 text-sm"
              >
                {totalPages}
              </button>
            </>
          )}

          <button
            type="button"
            disabled={safePage === totalPages}
            onClick={() =>
              setPage(Math.min(totalPages, safePage + 1))
            }
            className="h-8 w-8 rounded-md border border-border text-sm disabled:opacity-40"
          >
            ›
          </button>
        </div>
      </div>
    </div>
  );
};