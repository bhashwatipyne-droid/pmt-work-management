import {
  STAGE_COLORS,
  STATUS_COLORS,
} from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";

const fmtDate = (iso) => {
  if (!iso) return "—";

  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
};

const initial = (name) =>
  (name || "?").trim().charAt(0).toUpperCase();

export const ProjectListTable = ({
  projects,
  users,
  onOpenProject,
}) => (
  <div className="overflow-x-auto rounded-xl border border-border bg-card">
    <table className="w-full min-w-[900px] text-left text-sm">
      <thead>
        <tr className="border-b border-border bg-[#f7f9fc] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <th className="px-4 py-3">Project</th>
          <th className="px-4 py-3">Client</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Deliverables</th>
          <th className="px-4 py-3">
            Content · Design · Animate
          </th>
          <th className="px-4 py-3">Deadline</th>
          <th className="px-4 py-3">Collaborators</th>
        </tr>
      </thead>

      <tbody>
        {projects.map((p) => {
          const c =
            STATUS_COLORS[p.status] || STATUS_COLORS.Active;

          const collaborators = (p.collaborator_ids || [])
            .map((id) => users.find((u) => u.id === id))
            .filter(Boolean)
            .slice(0, 3);

          return (
            <tr
              key={p.id}
              data-testid={`${PROJECTS.listRowPrefix}-${p.id}`}
              className="cursor-pointer border-b border-border last:border-0 transition-colors hover:bg-[#fafbff]"
              onClick={() => onOpenProject?.(p)}
            >
              <td className="px-4 py-3.5">
                <div className="font-medium text-foreground">
                  {p.name}
                </div>

                <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {p.code}
                </div>
              </td>

              <td className="px-4 py-3.5 text-sm text-slate-600">
                {p.client_name || "—"}
              </td>

              <td className="px-4 py-3.5">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${c.badge}`}
                >
                  {p.status}
                </span>
              </td>

              <td className="px-4 py-3.5 font-medium text-slate-700">
                {p.deliverables_count}
              </td>

              <td className="px-4 py-3.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
                  {["Content", "Design", "Animate"].map(
                    (stage) => (
                      <span
                        key={stage}
                        className="flex items-center gap-1.5"
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${STAGE_COLORS[stage].dot}`}
                        />

                        <span
                          className={`${STAGE_COLORS[stage].text} font-medium`}
                        >
                          {stage}{" "}
                          {p.stage_counts?.[stage] ?? 0}
                        </span>
                      </span>
                    )
                  )}
                </div>
              </td>

              <td className="px-4 py-3.5 text-sm text-muted-foreground">
                {fmtDate(p.end_date)}
              </td>

              <td className="px-4 py-3.5">
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
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);