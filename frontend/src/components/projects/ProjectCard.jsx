import { STAGE_COLORS, STATUS_COLORS } from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";
import { ArrowRight, Building2, User as UserIcon } from "lucide-react";

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
};

const initial = (name) => (name || "?").trim().charAt(0).toUpperCase();

export const ProjectCard = ({ project, users, onOpen }) => {
  const status = STATUS_COLORS[project.status] || STATUS_COLORS.Active;
  const poc = project.client_poc;
  const collaborators = (project.collaborator_ids || [])
    .map((id) => users.find((u) => u.id === id))
    .filter(Boolean)
    .slice(0, 3);

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={`${PROJECTS.cardPrefix}-${project.id}`}
      className={`w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus:ring-2 ${status.ring}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-mono text-slate-400">{project.code}</div>
        <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.badge}`}>
          {project.status}
        </span>
      </div>
      <div className="mt-2 line-clamp-2 text-[15px] font-semibold text-slate-900">{project.name}</div>

      <div className="mt-3 space-y-1.5 text-[12px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5" />
          <span>{project.client_name || "—"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <UserIcon className="h-3.5 w-3.5" />
          <span>{poc || "Unassigned"}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {Object.entries(STAGE_COLORS).map(([stage, c]) => (
          <span key={stage} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${c.dot}`} />
            <span className={`${c.text} font-medium`}>{stage} {project.stage_counts?.[stage] ?? 0}</span>
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <div className="flex -space-x-2">
          {collaborators.length > 0 ? (
            collaborators.map((u) => (
              <div key={u.id} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700 ring-2 ring-white">
                {initial(u.name)}
              </div>
            ))
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-400 ring-2 ring-white">
              U
            </div>
          )}
        </div>
        <span className="text-[11px] text-slate-500">{fmtDate(project.end_date)}</span>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">{project.deliverables_count} deliverable{project.deliverables_count === 1 ? "" : "s"}</span>
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-indigo-600">
          Open <ArrowRight className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
};