import {
  STAGE_COLORS,
  STATUS_COLORS,
} from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";
import {
  ArrowRight,
  Building2,
  User as UserIcon,
  MoreVertical,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

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

const initial = (name) =>
  (name || "?").trim().charAt(0).toUpperCase();

export const ProjectCard = ({
  project,
  users,
  onOpen,
  selected = false,
  onSelect,
  onHide,
  onUnhide,
  onDelete,
}) => {
  const status =
    STATUS_COLORS[project.status] || STATUS_COLORS.Active;

  const poc = project.client_poc;

  const collaborators = (project.collaborator_ids || [])
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean)
    .slice(0, 3);

  return (
    <div
      data-testid={`${PROJECTS.cardPrefix}-${project.id}`}
      className="w-full rounded-xl border border-border bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-[#c8c8ee] hover:shadow-md"
    >
      {/* Card controls */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect?.(project.id);
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 cursor-pointer rounded border-slate-300 text-[#2b2bb5] focus:ring-[#2b2bb5]"
            aria-label={`Select ${project.name}`}
          />

          <div className="font-mono text-[11px] text-muted-foreground">
            {project.code}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${status.badge}`}
          >
            {project.status}
          </span>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-slate-100 hover:text-foreground"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen?.();
                }}
              >
                View details
              </DropdownMenuItem>

              {project.hidden ? (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnhide?.(project);
                  }}
                >
                  <Eye className="h-4 w-4" />
                  Unhide project
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onHide?.(project);
                  }}
                >
                  <EyeOff className="h-4 w-4" />
                  Hide project
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                className="text-red-600 focus:text-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete?.(project);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Delete project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Project name */}
      <button
        type="button"
        onClick={onOpen}
        className="mt-2 block w-full text-left line-clamp-2 text-sm font-semibold leading-5 text-foreground hover:text-[#2b2bb5]"
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
            <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />

            <span className={`text-[11px] font-medium ${c.text}`}>
              {stage} {project.stage_counts?.[stage] ?? 0}
            </span>
          </span>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <div className="flex -space-x-2">
          {collaborators.length > 0 ? (
            collaborators.map((u) => (
              <div
                key={u.id}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#f0f0fd] text-[10px] font-semibold text-[#1a1a8a]"
              >
                {initial(u.name)}
              </div>
            ))
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[10px] font-semibold text-slate-400">
              U
            </div>
          )}
        </div>

        <span className="text-[11px] text-muted-foreground">
          {fmtDate(project.end_date)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {project.deliverables_count} deliverable
          {project.deliverables_count === 1 ? "" : "s"}
        </span>

        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 text-xs font-medium text-[#2b2bb5]"
        >
          Open
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
};