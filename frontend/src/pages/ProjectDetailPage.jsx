import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  User as UserIcon,
  Calendar,
  Plus,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  getProject,
  getWorkItems,
  getOptions,
  updateProject,
  approveDeliverable,
  rejectDeliverable,
  getClients,
} from "@/services/api";
import {
  STAGE_COLORS,
  STATUS_COLORS,
  PROJECT_STATUSES,
  STAGES,
} from "@/constants/projectPalette";
import { DeliverableModal } from "@/components/projects/DeliverableModal";
import ProjectEditModal from "@/components/projects/ProjectEditModal";

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

const stageStatusBadge = (s) => {
  if (s === "Ready for Review") {
    return "bg-blue-50 text-blue-700";
  }

  if (s === "Changes Requested") {
    return "bg-amber-50 text-amber-700";
  }

  if (s === "Completed") {
    return "bg-green-50 text-green-700";
  }

  if (s === "In Progress") {
    return "bg-[#f0f0fd] text-[#1a1a8a]";
  }

  return "bg-slate-100 text-slate-600";
};

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const {
    currentUser,
    currentUserId,
    users,
    loading: userLoading,
  } = useUser();

  const [project, setProject] = useState(null);
  const [workItems, setWorkItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [delivModal, setDelivModal] = useState({
    open: false,
    mode: "add",
    initial: null,
  });
  const [deliverableTypes, setDeliverableTypes] = useState([]);
  const [clients, setClients] = useState([]);
  const [editProjectOpen, setEditProjectOpen] = useState(false);

  const fetchAll = async () => {
    setLoading(true);

    try {
      const [p, w, options, clientsData] = await Promise.all([
        getProject(currentUserId, projectId),
        getWorkItems(currentUserId, {
          project_id: projectId,
        }),
        getOptions(),
        getClients(),
      ]);

      setProject(p);
      setWorkItems(w);
      setDeliverableTypes(
        options.deliverable_types || []
      );
      setClients(clientsData || []);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          "Failed to load project"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, currentUserId]);

  const handleStatusChange = async (status) => {
    try {
      const updated = await updateProject(
        currentUserId,
        projectId,
        { status }
      );

      setProject((p) => ({
        ...p,
        ...updated,
      }));

      toast.success(`Status → ${status}`);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          "Update failed"
      );
    }
  };

  const handleProjectEditSave = async (updates) => {
    await updateProject(
      currentUserId,
      projectId,
      updates
    );

    await fetchAll();
  };

  const decide = async (deliverableId, action) => {
    try {
      if (action === "approve") {
        await approveDeliverable(
          currentUserId,
          deliverableId
        );
      } else {
        await rejectDeliverable(
          currentUserId,
          deliverableId
        );
      }

      toast.success(
        action === "approve"
          ? "Approved"
          : "Sent back"
      );

      fetchAll();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          "Action failed"
      );
    }
  };

  if (userLoading || !currentUser) return null;

  if (loading || !project) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#f7f9fc] py-16 text-sm text-muted-foreground">
        Loading project…
      </div>
    );
  }

  const statusColor =
    STATUS_COLORS[project.status] ||
    STATUS_COLORS.Active;

  const poc = project.client_poc;
  const isElevated = currentUser.role !== "member";

  return (
    <div
      data-testid="project-detail-page"
      className="flex-1 overflow-auto bg-[#f7f9fc] px-6 py-6 lg:px-8"
    >
      {/* Back link */}
      <Link
        to="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-[#2b2bb5]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Projects
      </Link>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {project.code}
          </div>

          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
            {project.name}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {project.client_name || "—"}
            </span>

            <span className="flex items-center gap-1.5">
              <UserIcon className="h-3.5 w-3.5" />
              POC: {poc || "Unassigned"}
            </span>

            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              {fmtDate(project.start_date)} →{" "}
              {fmtDate(project.end_date)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentUser.role === "admin" && (
            <button
              type="button"
              onClick={() => setEditProjectOpen(true)}
              className="inline-flex h-10 items-center rounded-lg border border-border bg-white px-4 text-sm font-medium text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
            >
              Edit Project
            </button>
          )}

          {isElevated &&
          currentUser.role === "admin" ? (
            <select
              data-testid="project-detail-status-select"
              value={project.status}
              onChange={(e) =>
                handleStatusChange(e.target.value)
              }
              className={`h-10 rounded-lg border border-transparent px-3 text-xs font-semibold uppercase tracking-wide outline-none focus:ring-2 focus:ring-[#2b2bb5]/20 ${statusColor.badge}`}
            >
              {PROJECT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          ) : (
            <span
              className={`rounded-md px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${statusColor.badge}`}
            >
              {project.status}
            </span>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {STAGES.map((stage) => {
          const count =
            project.stage_counts?.[stage] ?? 0;

          const c = STAGE_COLORS[stage];

          return (
            <div
              key={stage}
              className="rounded-xl border border-border bg-white p-4 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${c.dot}`}
                />

                <span
                  className={`text-xs font-semibold ${c.text}`}
                >
                  {stage}
                </span>
              </div>

              <div className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
                {count}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Deliverables */}
        <div className="rounded-xl border border-border bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">
              Deliverables{" "}
              <span className="font-medium text-muted-foreground">
                ({project.deliverables?.length || 0})
              </span>
            </h2>

            {currentUser.role === "admin" && (
              <button
                data-testid="project-detail-add-deliverable-btn"
                onClick={() =>
                  setDelivModal({
                    open: true,
                    mode: "add",
                    initial: null,
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#dcdcf8] bg-[#f0f0fd] px-3 py-2 text-xs font-semibold text-[#1a1a8a] transition-colors hover:bg-[#dcdcf8] focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Deliverable
              </button>
            )}
          </div>

          {!project.deliverables ||
          project.deliverables.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No deliverables yet
            </div>
          ) : (
            <div className="space-y-2">
              {project.deliverables.map((d) => {
                const c =
                  STAGE_COLORS[d.current_stage] ||
                  STAGE_COLORS.Content;

                const owner = users.find(
                  (u) => u.id === d.owner_id
                );

                const canReview =
                  isElevated &&
                  d.stage_status ===
                    "Ready for Review";

                return (
                  <div
                    key={d.id}
                    data-testid={`project-detail-deliverable-${d.id}`}
                    className="rounded-lg border border-border p-3 transition-colors hover:bg-[#fafbff]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {d.name}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                          <span className="flex items-center gap-1">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${c.dot}`}
                            />

                            <span
                              className={`font-medium ${c.text}`}
                            >
                              {d.current_stage}
                            </span>
                          </span>

                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${stageStatusBadge(
                              d.stage_status
                            )}`}
                          >
                            {d.stage_status}
                          </span>

                          <span className="text-muted-foreground">
                            Owner:{" "}
                            {owner?.name ||
                              "Unassigned"}
                          </span>

                          {d.type && (
                            <span className="text-slate-400">
                              · {d.type}
                            </span>
                          )}
                        </div>
                      </div>

                      {currentUser.role === "admin" && (
                        <button
                          data-testid={`project-detail-edit-deliverable-${d.id}`}
                          onClick={() =>
                            setDelivModal({
                              open: true,
                              mode: "edit",
                              initial: d,
                            })
                          }
                          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
                          title="Edit deliverable"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {canReview && (
                      <div className="mt-3 flex gap-2">
                        <button
                          data-testid={`project-detail-approve-${d.id}`}
                          onClick={() =>
                            decide(
                              d.id,
                              "approve"
                            )
                          }
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-200"
                        >
                          Approve
                        </button>

                        <button
                          data-testid={`project-detail-reject-${d.id}`}
                          onClick={() =>
                            decide(
                              d.id,
                              "reject"
                            )
                          }
                          className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
                        >
                          Send Back
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Work Log */}
        <div className="rounded-xl border border-border bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-foreground">
            Work Log{" "}
            <span className="font-medium text-muted-foreground">
              ({workItems.length})
            </span>
          </h2>

          {workItems.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No work logged yet for this project.
            </div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 border-b border-border bg-white text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">
                      Date
                    </th>
                    <th className="py-2 pr-3">
                      Stage
                    </th>
                    <th className="py-2 pr-3">
                      Deliverable
                    </th>
                    <th className="py-2 pr-3">
                      By
                    </th>
                    <th className="py-2 pr-3">
                      Time
                    </th>
                    <th className="py-2 pr-3">
                      Status
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {workItems.map((w) => {
                    const author = users.find(
                      (u) => u.id === w.creator_id
                    );

                    return (
                      <tr
                        key={w.id}
                        className="border-t border-border"
                      >
                        <td className="py-2 pr-3 text-slate-600">
                          {w.work_date}
                        </td>

                        <td className="py-2 pr-3 text-slate-600">
                          {w.stage || "—"}
                        </td>

                        <td className="py-2 pr-3 text-slate-600">
                          {w.deliverable_name || "—"}
                        </td>

                        <td className="py-2 pr-3 text-slate-600">
                          {author?.name || "—"}
                        </td>

                        <td className="py-2 pr-3 text-slate-600">
                          {w.time_taken_minutes} min
                        </td>

                        <td className="py-2 pr-3 text-slate-600">
                          {w.status}
                        </td>
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
        currentUserId={currentUserId}
        users={users}
        deliverableTypes={deliverableTypes}
        onClose={() =>
          setDelivModal((m) => ({
            ...m,
            open: false,
          }))
        }
        onSaved={fetchAll}
      />

      <ProjectEditModal
        open={editProjectOpen}
        onClose={() => setEditProjectOpen(false)}
        onSaved={handleProjectEditSave}
        project={project}
        clients={clients}
        currentUserId={currentUserId}
      />
    </div>
  );
}