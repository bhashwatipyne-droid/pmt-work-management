import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Building2, User as UserIcon, Calendar, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/context/UserContext";
import {
  getProject,
  getWorkItems,
  updateProject,
  approveDeliverable,
  rejectDeliverable,
} from "@/services/api";
import { STAGE_COLORS, STATUS_COLORS, PROJECT_STATUSES, STAGES } from "@/constants/projectPalette";
import { DeliverableModal } from "@/components/projects/DeliverableModal";

const fmtDate = (iso) => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
};

const stageStatusBadge = (s) => {
  if (s === "Ready for Review") return "bg-blue-100 text-blue-700";
  if (s === "Changes Requested") return "bg-amber-100 text-amber-700";
  if (s === "Completed") return "bg-emerald-100 text-emerald-700";
  if (s === "In Progress") return "bg-indigo-100 text-indigo-700";
  return "bg-slate-100 text-slate-600";
};

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const { currentUser, currentUserId, users, loading: userLoading } = useUser();
  const [project, setProject] = useState(null);
  const [workItems, setWorkItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [delivModal, setDelivModal] = useState({ open: false, mode: "add", initial: null });

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [p, w] = await Promise.all([
        getProject(currentUserId, projectId),
        getWorkItems(currentUserId, { project_id: projectId }),
      ]);
      setProject(p);
      setWorkItems(w);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to load project");
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (currentUser) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, currentUserId]);

  const handleStatusChange = async (status) => {
    try {
      const updated = await updateProject(currentUserId, projectId, { status });
      setProject((p) => ({ ...p, ...updated }));
      toast.success(`Status → ${status}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Update failed");
    }
  };

  const decide = async (deliverableId, action) => {
    try {
      if (action === "approve") await approveDeliverable(currentUserId, deliverableId);
      else await rejectDeliverable(currentUserId, deliverableId);
      toast.success(action === "approve" ? "Approved" : "Sent back");
      fetchAll();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Action failed");
    }
  };

  if (userLoading || !currentUser) return null;
  if (loading || !project) return <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-400">Loading project…</div>;

  const statusColor = STATUS_COLORS[project.status] || STATUS_COLORS.Active;
  const poc = users.find((u) => u.id === project.poc_id);
  const isElevated = currentUser.role !== "member";

  return (
    <div data-testid="project-detail-page" className="flex-1 overflow-auto px-8 py-6">
      {/* Back link */}
      <Link to="/projects" className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Projects
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-mono text-slate-400">{project.code}</div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{project.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {project.client_name || "—"}</span>
            <span className="flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> POC: {poc?.name || "Unassigned"}</span>
            <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> {fmtDate(project.start_date)} → {fmtDate(project.end_date)}</span>
          </div>
        </div>
        {isElevated && currentUser.role === "admin" ? (
          <select
            data-testid="project-detail-status-select"
            value={project.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${statusColor.badge}`}
          >
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor.badge}`}>{project.status}</span>
        )}
      </div>

      {/* Metric strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {STAGES.map((stage) => {
          const count = project.stage_counts?.[stage] ?? 0;
          const c = STAGE_COLORS[stage];
          return (
            <div key={stage} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                <span className={`text-xs font-semibold ${c.text}`}>{stage}</span>
              </div>
              <div className="mt-1 text-2xl font-bold text-slate-900">{count}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Deliverables */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Deliverables <span className="text-slate-400 font-medium">({project.deliverables?.length || 0})</span></h2>
            {currentUser.role === "admin" && (
              <button
                data-testid="project-detail-add-deliverable-btn"
                onClick={() => setDelivModal({ open: true, mode: "add", initial: null })}
                className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                <Plus className="h-3.5 w-3.5" /> Add Deliverable
              </button>
            )}
          </div>
          {(!project.deliverables || project.deliverables.length === 0) ? (
            <div className="py-10 text-center text-sm text-slate-400">No deliverables yet</div>
          ) : (
            <div className="space-y-2">
              {project.deliverables.map((d) => {
                const c = STAGE_COLORS[d.current_stage] || STAGE_COLORS.Content;
                const owner = users.find((u) => u.id === d.owner_id);
                const canReview = isElevated && d.stage_status === "Ready for Review";
                return (
                  <div key={d.id} data-testid={`project-detail-deliverable-${d.id}`} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900">{d.name}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
                          <span className="flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                            <span className={`font-medium ${c.text}`}>{d.current_stage}</span>
                          </span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${stageStatusBadge(d.stage_status)}`}>{d.stage_status}</span>
                          <span className="text-slate-500">Owner: {owner?.name || "Unassigned"}</span>
                          {d.type && <span className="text-slate-400">· {d.type}</span>}
                        </div>
                      </div>
                      {currentUser.role === "admin" && (
                        <button
                          data-testid={`project-detail-edit-deliverable-${d.id}`}
                          onClick={() => setDelivModal({ open: true, mode: "edit", initial: d })}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          title="Edit deliverable"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {canReview && (
                      <div className="mt-2 flex gap-2">
                        <button
                          data-testid={`project-detail-approve-${d.id}`}
                          onClick={() => decide(d.id, "approve")}
                          className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >Approve</button>
                        <button
                          data-testid={`project-detail-reject-${d.id}`}
                          onClick={() => decide(d.id, "reject")}
                          className="rounded border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >Send Back</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Work items logged against this project */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <h2 className="mb-4 text-base font-bold text-slate-900">Work Log <span className="text-slate-400 font-medium">({workItems.length})</span></h2>
          {workItems.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">No work logged yet for this project.</div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-white text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Stage</th>
                    <th className="py-2 pr-3">Deliverable</th>
                    <th className="py-2 pr-3">By</th>
                    <th className="py-2 pr-3">Time</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {workItems.map((w) => {
                    const author = users.find((u) => u.id === w.creator_id);
                    return (
                      <tr key={w.id} className="border-t border-slate-100">
                        <td className="py-2 pr-3">{w.work_date}</td>
                        <td className="py-2 pr-3">{w.stage || "—"}</td>
                        <td className="py-2 pr-3">{w.deliverable_name || "—"}</td>
                        <td className="py-2 pr-3">{author?.name || "—"}</td>
                        <td className="py-2 pr-3">{w.time_taken_minutes} min</td>
                        <td className="py-2 pr-3">{w.status}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <DeliverableModal
        open={delivModal.open}
        mode={delivModal.mode}
        projectId={projectId}
        initial={delivModal.initial}
        users={users}
        onClose={() => setDelivModal((m) => ({ ...m, open: false }))}
        onSaved={fetchAll}
      />
    </div>
  );
}
