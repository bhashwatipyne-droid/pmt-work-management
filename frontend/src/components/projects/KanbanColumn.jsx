import { STATUS_COLORS } from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";
import { ProjectCard } from "./ProjectCard";
import { KanbanColumn as BaseKanbanColumn } from "@/components/ui/KanbanColumn";

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
    <BaseKanbanColumn
      title={status}
      count={projects.length}
      dotClassName={c?.dot}
      titleClassName={c?.text || "text-foreground"}
      empty={projects.length === 0 ? "No projects" : null}
    >
      {projects.length > 0 && (
        <div
          data-testid={COLUMN_TESTIDS[status]}
          className="flex flex-col gap-3"
        >
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              users={users}
              onOpen={() => onOpenProject?.(p)}
            />
          ))}
        </div>
      )}
    </BaseKanbanColumn>
  );
};