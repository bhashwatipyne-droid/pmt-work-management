import { Eye } from "lucide-react";

import { STATUS_COLORS } from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";
import { ProjectCard } from "./ProjectCard";
import { KanbanColumn as BaseKanbanColumn } from "@/components/ui/KanbanColumn";

const COLUMN_TESTIDS = {
  Active: PROJECTS.columnActive,
  "Approval Pending": PROJECTS.columnApprovalPending,
  Completed: PROJECTS.columnCompleted,
  "Raised Invoice": PROJECTS.columnRaisedInvoice,
  "On Hold": PROJECTS.columnOnHold,
  Scrapped: PROJECTS.columnScrapped,
};

export const KanbanColumn = ({
  status,
  projects,
  users,
  onOpenProject,
  selectedProjects,
  onSelectProject,
  onToggleVisibility,
}) => {
  const c = STATUS_COLORS[status];

  return (
    <BaseKanbanColumn
      title={status}
      count={projects.length}
      dotClassName={c?.dot}
      titleClassName={c?.text || "text-foreground"}
      headerAction={
        <button
          type="button"
          onClick={() => onToggleVisibility?.(status)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[#667085] transition-colors hover:bg-[#f0f0fd] hover:text-[#2b2bb5]"
          title={`Hide ${status} column`}
          aria-label={`Hide ${status} column`}
        >
          <Eye className="h-4 w-4" />
        </button>
      }
      empty={projects.length === 0 ? "No projects" : null}
    >
      {projects.length > 0 && (
        <div
          data-testid={COLUMN_TESTIDS[status]}
          className="flex flex-col gap-3"
        >
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              users={users}
              selected={selectedProjects?.has(project.id)}
              onSelect={onSelectProject}
              onOpen={() => onOpenProject?.(project)}
            />
          ))}
        </div>
      )}
    </BaseKanbanColumn>
  );
};