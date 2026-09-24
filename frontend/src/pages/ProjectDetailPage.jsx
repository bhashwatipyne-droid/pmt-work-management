import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  User as UserIcon,
  Calendar,
  Plus,
  Pencil,
  Trash2,
  Upload,
  AlertTriangle,
  Star,
} from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import { useAccess } from "@/hooks/useAccess";
import { usePinnedProjects } from "@/hooks/usePinnedProjects";
import {
  getProject,
  getWorkItems,
  getOptions,
  updateProject,
  deleteProject,
  getClients,
} from "@/services/api";
import {
  STAGE_COLORS,
  STATUS_COLORS,
  PROJECT_STATUSES,
  STAGES,
} from "@/constants/projectPalette";
import { DeliverableModal } from "@/components/projects/DeliverableModal";
import { ImportDeliverablesModal } from "@/components/projects/ImportDeliverablesModal";
import ProjectEditModal from "@/components/projects/ProjectEditModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { trackEvent } from "../analytics";
import { ProjectDetailSkeleton } from "@/components/skeletons/Skeletons";

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

const fmtShort = (iso) => {
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

const todayIso = () => new Date().toISOString().slice(0, 10);

// A stage's own window is overdue when its end date has passed and the
// deliverable hasn't moved on from it yet - mirrors the backend's
// per-stage overdue check (server.py's _ensure_overdue_notifications),
// which is what actually drives the notification, so a viewer sees the
// same "late" verdict here without waiting for that background job to run.
const isStageOverdue = (deliverable, stage) => {
  if (deliverable.current_stage !== stage) return false;
  if (deliverable.stage_status === "Completed") return false;
  const end = deliverable.stage_schedule?.[stage]?.end_dt;
  return Boolean(end) && end < todayIso();
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
  const navigate = useNavigate();
  const {
    currentUser,
    currentUserId,
    users,
    loading: userLoading,
  } = useUser();

  const access = useAccess();
  // Everyone can open a project; only admins can change it.
  const canManage = access.canManageProjects;
  const { isPinned, togglePin } = usePinnedProjects();

  const [project, setProject] = useState(null);
  const [workItems, setWorkItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [delivModal, setDelivModal] = useState({
    open: false,
    mode: "add",
    initial: null,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [deliverableTypes, setDeliverableTypes] = useState([]);
  const [clients, setClients] = useState([]);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);

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

      // Belt-and-braces: also pull in any work item that references one of
      // this project's deliverables directly. A work item's project_id is
      // supposed to always match its deliverable's project, but a handful of
      // older or imported rows can have it blank or pointing somewhere else -
      // filtering by project_id alone would then silently drop them from the
      // Work Log even though the deliverable they belong to is right here.
      const deliverableIds = (p.deliverables || [])
        .map((d) => d.id)
        .filter(Boolean);
      let mergedWorkItems = w;

      if (deliverableIds.length) {
        try {
          const byDeliverable = await getWorkItems(currentUserId, {
            deliverable_id: deliverableIds,
          });
          const byId = new Map(mergedWorkItems.map((item) => [item.id, item]));
          byDeliverable.forEach((item) => byId.set(item.id, item));
          mergedWorkItems = [...byId.values()];
        } catch {
          // Non-fatal — the project_id-based list above still shows.
        }
      }

      setProject(p);
      setWorkItems(mergedWorkItems);
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
    if (currentUser) {
      fetchAll();

      trackEvent("project_detail_opened", {
        project_id: projectId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, currentUserId]);

  const handleStatusChange = async (status) => {
    try {
      const updated = await updateProject(
        currentUserId,
        projectId,
        { status }
      );

      trackEvent("project_status_changed", {
        project_id: projectId,
        to_status: status,
      });

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

  const handleProjectDelete = async () => {
    setDeletingProject(true);

    try {
      await deleteProject(currentUserId, projectId);

      toast.success("Project deleted");
      navigate("/projects");
    } catch (e) {
      toast.error(
        e.response?.data?.detail || "Could not delete project"
      );
    } finally {
      setDeletingProject(false);
    }
  };

  if (userLoading || !currentUser) return null;

  if (loading || !project) {
    return <ProjectDetailSkeleton />;
  }

  const statusColor =
    STATUS_COLORS[project.status] ||
    STATUS_COLORS.Active;

  const poc = project.client_poc;

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
          <button
            type="button"
            onClick={() => {
              const nowPinned = togglePin(project);
              toast.success(nowPinned ? "Pinned to sidebar" : "Unpinned");
            }}
            aria-label={isPinned(project.id) ? "Unpin project" : "Pin project"}
            aria-pressed={isPinned(project.id)}
            title={isPinned(project.id) ? "Unpin from sidebar" : "Pin to sidebar"}
            data-testid="project-detail-pin-btn"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
          >
            <Star
              className={`h-4 w-4 ${
                isPinned(project.id) ? "fill-amber-400 text-amber-500" : ""
              }`}
            />
          </button>

          {canManage && (
            <button
              type="button"
              onClick={() => setEditProjectOpen(true)}
              aria-label="Edit project"
              title="Edit project"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => setDeleteProjectOpen(true)}
              aria-label="Delete project"
              title="Delete project"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}

          {canManage ? (
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

            {canManage && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="project-detail-import-deliverables-btn"
                  onClick={() => setImportOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import Deliverables
                </button>

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
              </div>
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

                          {isStageOverdue(d, d.current_stage) && (
                            <span
                              data-testid={`project-detail-deliverable-overdue-${d.id}`}
                              className="flex items-center gap-1 rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700"
                              title={`${d.current_stage} was due ${fmtDate(
                                d.stage_schedule?.[d.current_stage]?.end_dt
                              )}`}
                            >
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Overdue
                            </span>
                          )}

                          {d.type && (
                            <span className="text-slate-400">
                              · {d.type}
                            </span>
                          )}
                        </div>

                        {/* Per-stage deadline windows - the deliverable's own
                            start_dt/end_dt (shown above the card list, if
                            anywhere) are only the derived overall range;
                            this is where each team's actual window lives. */}
                        {Object.keys(d.stage_schedule || {}).length > 0 && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                            {(d.required_stages || []).map((stage) => {
                              const window = d.stage_schedule?.[stage];
                              if (!window) return null;
                              const overdue = isStageOverdue(d, stage);
                              return (
                                <span
                                  key={stage}
                                  className={
                                    overdue
                                      ? "font-medium text-rose-600"
                                      : stage === d.current_stage
                                        ? "font-medium text-foreground"
                                        : undefined
                                  }
                                >
                                  {stage}:{" "}
                                  {window.start_dt
                                    ? `${fmtShort(window.start_dt)} – ${fmtShort(window.end_dt)}`
                                    : `due ${fmtShort(window.end_dt)}`}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Workflow:{" "}
                          {(d.required_stages || [d.current_stage]).join(
                            " → "
                          )}
                        </div>
                      </div>

                      {canManage && (
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
        deliverableTypes={deliverableTypes}
        onClose={() =>
          setDelivModal((m) => ({
            ...m,
            open: false,
          }))
        }
        onSaved={fetchAll}
      />

      <ImportDeliverablesModal
        open={importOpen}
        projectId={projectId}
        deliverableTypes={deliverableTypes}
        onClose={() => setImportOpen(false)}
        onImported={fetchAll}
      />

      <ProjectEditModal
        open={editProjectOpen}
        onClose={() => setEditProjectOpen(false)}
        onSaved={handleProjectEditSave}
        project={project}
        clients={clients}
      />

      <ConfirmDeleteModal
        open={deleteProjectOpen}
        onClose={() => {
          if (!deletingProject) {
            setDeleteProjectOpen(false);
          }
        }}
        onConfirm={handleProjectDelete}
        title="Delete this project?"
        description={`"${project.name}" will be permanently deleted.`}
        warning="Its deliverables will also be deleted, but all historical work entries will be preserved."
        confirmLabel="Delete Project"
        loading={deletingProject}
      />
    </div>
  );
}