import { STAGE_COLORS, STATUS_COLORS } from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";

const fmtDate = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch {
    return iso;
  }
};

const initial = (name) => (name || "?").trim().charAt(0).toUpperCase();

export const ProjectListTable = ({ projects, users, onOpenProject }) => (
  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
    <table className="w-full min-w-[900px] text-left text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <th className="px-4 py-3">Project</th>
          <th className="px-4 py-3">Client</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Deliverables</th>
          <th className="px-4 py-3">Content · Design · Animate</th>
          <th className="px-4 py-3">Deadline</th>
          <th className="px-4 py-3">Collaborators</th>
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => {
          const c = STATUS_COLORS[p.status] || STATUS_COLORS.Active;
          const collaborators = (p.collaborator_ids || [])
            .map((id) => users.find((u) => u.id === id))
            .filter(Boolean)
            .slice(0, 3);
          return (
            <tr
              key={p.id}
              data-testid={`${PROJECTS.listRowPrefix}-${p.id}`}
              className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
              onClick={() => onOpenProject?.(p)}
            >
              <td className="px-4 py-3">
                <div className="font-semibold text-slate-900">{p.name}</div>
                <div className="text-[11px] font-mono text-slate-400">{p.code}</div>
              </td>
              <td className="px-4 py-3 font-medium text-slate-700">{p.client_name || "—"}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.badge}`}>
                  {p.status}
                </span>
              </td>
              <td className="px-4 py-3 font-medium text-slate-700">{p.deliverables_count}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                  {["Content", "Design", "Animate"].map((stage) => (
                    <span key={stage} className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${STAGE_COLORS[stage].dot}`} />
                      <span className={`${STAGE_COLORS[stage].text} font-medium`}>
                        {stage} {p.stage_counts?.[stage] ?? 0}
                      </span>
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-slate-600">{fmtDate(p.end_date)}</td>
              <td className="px-4 py-3">
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
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);
