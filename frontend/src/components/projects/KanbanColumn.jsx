import { STATUS_COLORS } from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";
import { ProjectCard } from "./ProjectCard";

const COLUMN_TESTIDS = {
  Planning: PROJECTS.columnPlanning,
  Active: PROJECTS.columnActive,
  "In Rework": PROJECTS.columnRework,
  Completed: PROJECTS.columnCompleted,
};

export const KanbanColumn = ({
  status,
  projects,
  users,
  onOpenProject,
}) => {
  const c = STATUS_COLORS[status];

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-white px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${c.dot}`} />

          <span className={`text-sm font-semibold ${c.text}`}>
            {status}
          </span>
        </div>

        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          {projects.length}
        </span>
      </div>

      <div
        data-testid={COLUMN_TESTIDS[status]}
        className="flex flex-col gap-3"
      >
        {projects.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-border bg-white/60 text-xs text-muted-foreground">
            No projects
          </div>
        ) : (
          projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              users={users}
              onOpen={() => onOpenProject?.(p)}
            />
          ))
        )}
      </div>
    </div>
  );
};