import { makeMatcher } from "@/lib/search";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import { consumePrefetch } from "@/services/prefetch";
import { useAccess } from "@/hooks/useAccess";
import {
  getProject,
  getProjectWorkLog,
  getOptions,
  updateProject,
  deleteProject,
  getClients,
  getWorksheetLookups,
  updateDeliverable,
} from "@/services/api";
import { findLookalikes } from "@/lib/lookalikes";
import { STAGES } from "@/constants/projectPalette";
import { APP_ACTIONS, requestAppAction } from "@/lib/appActions";
import { DeliverableModal } from "@/components/projects/DeliverableModal";
import { ImportDeliverablesModal } from "@/components/projects/ImportDeliverablesModal";
import ProjectEditModal from "@/components/projects/ProjectEditModal";
import ShareProjectModal from "@/components/projects/ShareProjectModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { QuickLogTrigger } from "@/components/work-sheet/QuickLogTrigger";
import { trackEvent } from "../analytics";
import { ProjectDetailSkeleton } from "@/components/skeletons/Skeletons";
import { ProjectHeader } from "@/components/projects/detail/ProjectHeader";
import { ProjectStats } from "@/components/projects/detail/ProjectStats";
import { ProjectTabsPanel } from "@/components/projects/detail/ProjectTabsPanel";
import { BADGE, BRAND_500, DELIVERABLE_STATUS, DELIVERABLE_STATUSES, NEUTRAL_900, PROJECT_STATUS_DOT, STAGE_DOT, isOverdue, stageOf, stageWindow, statusOf } from "@/components/projects/detail/projectDetailView";
import { downloadCsv, slugify, todayStamp } from "@/lib/exportCsv";

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
  const canLogWork = access.canLogWork;

  const [project, setProject] = useState(null);
  const [workItems, setWorkItems] = useState([]);
  const [workLogTotal, setWorkLogTotal] = useState(0);
  const [loggedMinutes, setLoggedMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useSessionState(`project-${projectId}-tab`, "deliverables");
  const [stageFilter, setStageFilter] = useSessionState(`project-${projectId}-stage`, "all");
  const [query, setQuery] = useSessionState(`project-${projectId}-query`, "");
  const [closedGroups, setClosedGroups] = useSessionState(`project-${projectId}-closed`, {});
  const [delivModal, setDelivModal] = useState({
    open: false,
    mode: "add",
    initial: null,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [deliverableTypes, setDeliverableTypes] = useState([]);
  const [clients, setClients] = useState([]);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  // Other projects with names easy to confuse with this one, warned about
  // under the title so the team checks the project code when logging.
  const [lookalikes, setLookalikes] = useState([]);

  const fetchAll = async () => {
    setLoading(true);

    try {
      // One slim work-log query (the server merges the project_id and
      // deliverable_id matches itself) instead of two full /work-items
      // downloads. Clients are only needed by the edit-project modal, so they
      // load on demand (see the effect below), not on every page open.
      // Usually already on its way from boot (services/prefetch).
      const [p, workLog, options] = await Promise.all([
        consumePrefetch(`project:${projectId}`, () => getProject(currentUserId, projectId)),
        consumePrefetch(`project-worklog:${projectId}`, () =>
          getProjectWorkLog(currentUserId, projectId)
        ),
        consumePrefetch("project-options", () => getOptions()),
      ]);

      const items = workLog.items || [];
      setProject(p);
      setWorkItems(items);
      setWorkLogTotal(workLog.total ?? items.length);
      setLoggedMinutes(
        workLog.total_minutes ??
          items.reduce((sum, w) => sum + (Number(w.time_taken_minutes) || 0), 0)
      );
      setDeliverableTypes(options.deliverable_types || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to load project");
    } finally {
      setLoading(false);
    }
  };

  // The Work Sheet's slim lookup (names, clients, codes) is enough to find
  // look-alike project names; a failure just means no warning is shown.
  useEffect(() => {
    if (!project?.id) return undefined;
    let cancelled = false;
    getWorksheetLookups()
      .then((data) => {
        if (cancelled) return;
        const names = new Map((data?.clients || []).map((c) => [c.id, c.name]));
        setLookalikes(
          findLookalikes(project, data?.projects || [], (id) => names.get(id) || "")
        );
      })
      .catch(() => !cancelled && setLookalikes([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.name, project?.client_id]);

  useEffect(() => {
    if (!editProjectOpen || clients.length) return;
    getClients()
      .then((data) => setClients(data || []))
      .catch(() => toast.error("Could not load clients"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editProjectOpen]);

  // Lightweight refresh for edits that only change the project or its
  // deliverables. No loading flag: the page stays put instead of flashing a
  // skeleton.
  const refreshProject = async () => {
    try {
      setProject(await getProject(currentUserId, projectId));
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to refresh project");
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
    if (status === project.status) return;
    try {
      const updated = await updateProject(currentUserId, projectId, { status });

      trackEvent("project_status_changed", {
        project_id: projectId,
        to_status: status,
      });

      setProject((p) => ({ ...p, ...updated }));
      toast.success(`Project marked ${status.toLowerCase()}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Update failed");
    }
  };

  const setDeliverableName = (id, name) =>
    setProject((p) => ({
      ...p,
      deliverables: (p.deliverables || []).map((x) =>
        x.id === id ? { ...x, name } : x
      ),
    }));

  const handleRename = async (deliverable, name) => {
    const previous = deliverable.name;
    setDeliverableName(deliverable.id, name);
    try {
      await updateDeliverable(currentUserId, deliverable.id, { name });
      toast.success("Deliverable renamed");
    } catch (err) {
      setDeliverableName(deliverable.id, previous);
      toast.error(err?.response?.data?.detail || "Could not rename deliverable");
    }
  };

  const handleProjectEditSave = async (updates) => {
    await updateProject(currentUserId, projectId, updates);
    await refreshProject();
  };

  const handleProjectDelete = async () => {
    setDeletingProject(true);

    try {
      await deleteProject(currentUserId, projectId);

      toast.success("Project deleted");
      navigate("/projects");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not delete project");
    } finally {
      setDeletingProject(false);
    }
  };

  // The quick logger lives on the work sheet; open it there.
  const openQuickLog = () => {
    requestAppAction(APP_ACTIONS.QUICK_LOG);
    navigate("/");
  };

  const deliverables = useMemo(() => project?.deliverables || [], [project]);
  const userName = useMemo(
    () => Object.fromEntries((users || []).map((u) => [u.id, u.name])),
    [users]
  );

  const q = query.trim();

  const deliverableGroups = useMemo(() => {
    const match = makeMatcher(q);
    const filtered = deliverables.filter(
      (d) =>
        (stageFilter === "all" || stageOf(d) === stageFilter) &&
        match(d.name, d.type)
    );
    return STAGES.map((stage) => {
      const rows = filtered.filter((d) => stageOf(d) === stage);
      return {
        stage,
        rows,
        done: rows.filter((d) => statusOf(d) === "Completed").length,
      };
    }).filter((g) => g.rows.length);
  }, [deliverables, stageFilter, q]);

  const workGroups = useMemo(() => {
    const match = makeMatcher(q);
    const filtered = workItems.filter((w) =>
      match(w.deliverable_name, userName[w.creator_id], w.stage)
    );
    const byDate = new Map();
    filtered.forEach((w) => {
      const key = w.work_date || "";
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(w);
    });
    return [...byDate.entries()].map(([date, rows]) => ({
      date,
      rows,
      minutes: rows.reduce((sum, w) => sum + (Number(w.time_taken_minutes) || 0), 0),
    }));
  }, [workItems, q, userName]);

  const people = useMemo(() => {
    const totals = new Map();
    workItems.forEach((w) => {
      const name = userName[w.creator_id] || "Unknown";
      totals.set(name, (totals.get(name) || 0) + (Number(w.time_taken_minutes) || 0));
    });
    const sum = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
    return [...totals.entries()]
      .map(([name, minutes]) => ({ name, minutes, pct: Math.round((minutes / sum) * 100) }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [workItems, userName]);

  // Height of the pinned stats block, so the tabs row can pin right below it.
  const statsRef = useRef(null);
  const [statsH, setStatsH] = useState(0);
  useEffect(() => {
    const el = statsRef.current;
    if (!el) return undefined;
    const measure = () => setStatsH(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [project]);

  if (userLoading || !currentUser) return null;

  if (loading || !project) {
    return <ProjectDetailSkeleton />;
  }

  const total = deliverables.length;
  const done = deliverables.filter((d) => statusOf(d) === "Completed").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const segments = DELIVERABLE_STATUSES.map((s) => ({
    ...s,
    n: deliverables.filter((d) => statusOf(d) === s.key).length,
    color: BADGE[s.badge].dot,
  })).filter((s) => s.n);

  const tiles = ["all", ...STAGES].map((key) => {
    const rows =
      key === "all" ? deliverables : deliverables.filter((d) => stageOf(d) === key);
    return {
      key,
      label: key === "all" ? "All deliverables" : key,
      dot: STAGE_DOT[key] || NEUTRAL_900,
      count: rows.length,
      done: rows.filter((d) => statusOf(d) === "Completed").length,
    };
  });

  const toggleGroup = (key) =>
    setClosedGroups((c) => ({ ...c, [key]: !c[key] }));

  // Export the deliverables currently listed (search and stage filter applied)
  // as a CSV, in the same order and wording as the table.
  const handleExportDeliverables = () => {
    const listed = deliverableGroups.flatMap((g) => g.rows);
    if (listed.length === 0) {
      toast.info("No deliverables to export");
      return;
    }
    const header = [
      "Deliverable", "Type", "Current stage", "Workflow", "Status",
      "Start", "Due", "Overdue",
    ];
    const rows = listed.map((d) => {
      const win = stageWindow(d);
      const flow = d.required_stages?.length ? d.required_stages : [d.current_stage];
      const status = DELIVERABLE_STATUS[statusOf(d)] || DELIVERABLE_STATUS["Not Started"];
      return [
        d.name || "",
        d.type || "",
        stageOf(d),
        flow.filter(Boolean).join(" > "),
        status.label,
        (win.start || "").slice(0, 10),
        (win.end || "").slice(0, 10),
        isOverdue(d) ? "Yes" : "No",
      ];
    });
    const slug = slugify(project.name) || "project";
    downloadCsv(`${slug}-deliverables-${todayStamp()}.csv`, header, rows);
    trackEvent("project_deliverables_exported", {
      project_id: projectId,
      count: rows.length,
    });
    toast.success(
      `Exported ${rows.length} deliverable${rows.length === 1 ? "" : "s"}`
    );
  };

  const statusDot = PROJECT_STATUS_DOT[project.status] || BRAND_500;
  const isDeliv = tab === "deliverables";

  return (
    <div
      data-testid="project-detail-page"
      className="flex-1 overflow-auto bg-white font-['Inter',sans-serif] text-[rgb(13,27,62)] antialiased"
    >
      <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 pb-16 pt-3 md:gap-5 md:px-6 md:pt-4">
        <ProjectHeader canManage={canManage} currentUser={currentUser} handleStatusChange={handleStatusChange} lookalikes={lookalikes} navigate={navigate} project={project} setDeleteProjectOpen={setDeleteProjectOpen} setEditProjectOpen={setEditProjectOpen} setShareOpen={setShareOpen} statusDot={statusDot} />

        <ProjectStats done={done} loggedMinutes={loggedMinutes} pct={pct} segments={segments} setStageFilter={setStageFilter} setTab={setTab} stageFilter={stageFilter} statsRef={statsRef} tiles={tiles} total={total} />

        <ProjectTabsPanel canLogWork={canLogWork} canManage={canManage} closedGroups={closedGroups} deliverableGroups={deliverableGroups} handleExportDeliverables={handleExportDeliverables} handleRename={handleRename} isDeliv={isDeliv} loggedMinutes={loggedMinutes} openQuickLog={openQuickLog} people={people} q={q} query={query} setDelivModal={setDelivModal} setImportOpen={setImportOpen} setQuery={setQuery} setStageFilter={setStageFilter} setTab={setTab} stageFilter={stageFilter} statsH={statsH} tab={tab} toggleGroup={toggleGroup} total={total} userName={userName} workGroups={workGroups} workItems={workItems} workLogTotal={workLogTotal} />
      </div>

      {canLogWork && <QuickLogTrigger onOpen={openQuickLog} />}

      <DeliverableModal
        open={delivModal.open}
        mode={delivModal.mode}
        projectId={projectId}
        initial={delivModal.initial}
        currentUserId={currentUserId}
        deliverableTypes={deliverableTypes}
        onClose={() => setDelivModal((m) => ({ ...m, open: false }))}
        onSaved={refreshProject}
      />

      <ImportDeliverablesModal
        open={importOpen}
        projectId={projectId}
        deliverableTypes={deliverableTypes}
        onClose={() => setImportOpen(false)}
        onImported={refreshProject}
      />

      <ShareProjectModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        project={project}
        userId={currentUserId}
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
