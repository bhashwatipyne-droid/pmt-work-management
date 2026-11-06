import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import { useAccess } from "@/hooks/useAccess";
import { useUndo } from "@/hooks/useUndo";
import { useSessionState } from "@/hooks/useSessionState";
import {
  getProjects,
  getProjectMetrics,
  getClients,
  getOptions,
  getDeliverableNamesByProject,
  deleteProject,
} from "@/services/api";

import { PROJECT_STATUSES } from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";
import { COLUMN_WIDTH } from "@/components/projects/KanbanColumn";
import { DEFAULT_SORT } from "@/lib/projectSort";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { trackEvent } from "../analytics";
import { ProjectsContent } from "@/components/projects/page/ProjectsContent";
import { ProjectsBulkBar } from "@/components/projects/page/ProjectsBulkBar";
import { ProjectsFilterChips } from "@/components/projects/page/ProjectsFilterChips";
import { ProjectsToolbar } from "@/components/projects/page/ProjectsToolbar";
import { downloadCsv, todayStamp } from "@/lib/exportCsv";
import { useProjectsDerived } from "@/hooks/useProjectsDerived";
import { useProjectsSelection } from "@/hooks/useProjectsSelection";
import { useProjectsBulkActions } from "@/hooks/useProjectsBulkActions";
import { useProjectsDragDrop } from "@/hooks/useProjectsDragDrop";
import { PROJECTS_FIRST_PAGE, consumePrefetch } from "@/services/prefetch";

// A function with a permanent identity that always calls the latest version
// of `fn`. Lets the page hand the (memoized) project cards handlers that
// never change, so a page re-render doesn't force every card to re-render,
// while the handlers themselves keep reading the current state.
function useStableCallback(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}

// How many projects (the newest) the page asks for first, so it can show the
// board right away while the rest loads. Shared with the boot-time prefetch
// (services/prefetch), which must ask for exactly the same thing.
const FIRST_PAGE = PROJECTS_FIRST_PAGE;

export default function ProjectsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const access = useAccess();
  // Everyone can browse projects; only admins can create, edit, hide,
  // delete, reorder or bulk-change them (lib/permissions.js).
  const canManage = access.canManageProjects;
  const {
    currentUser,
    currentUserId,
    loading: userLoading,
  } = useUser();

  const [projects, setProjects] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [clients, setClients] = useState([]);
  const [deliverableTypes, setDeliverableTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  // Ctrl/Cmd+Z: hide / restore, status changes and board moves. (Deleting a
  // project is permanent, so it cannot be undone.)
  const { pushUndo } = useUndo();
  const [search, setSearch] = useSessionState("projects-search", "");
  // project id -> its deliverable names (lowercase), so the search box can find
  // a project by one of its deliverables. Loaded once, the first time someone
  // types, so opening the page does not pay for it.
  const [deliverableNamesByProject, setDeliverableNamesByProject] = useState(null);
  const [statusFilter, setStatusFilter] = useSessionState("projects-status", "");
  const [clientFilter, setClientFilter] = useSessionState("projects-client", "");
  const [pocFilter, setPocFilter] = useSessionState("projects-poc", "");
  const [dateFrom, setDateFrom] = useSessionState("projects-date-from", "");
  const [dateTo, setDateTo] = useSessionState("projects-date-to", "");
  const [visibility, setVisibility] = useSessionState("projects-visibility", "visible");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useSessionState("projects-view", "chart");
  const [sortBy, setSortBy] = useSessionState("projects-sort", DEFAULT_SORT);
  const [modalOpen, setModalOpen] = useState(false);

  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [hiddenColumns, setHiddenColumns] = useState(() => {
    try {
      return new Set(
        JSON.parse(
          localStorage.getItem("pmt-hidden-project-columns") || "[]"
        )
      );
    } catch {
      return new Set();
    }
  });

  const [listPage, setListPage] = useState(1);
  const [draggedProjectId, setDraggedProjectId] = useState(null);
  const [dragOverProjectId, setDragOverProjectId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);

  // Bumped by every load, so a slow earlier request that finishes after a
  // newer one can't overwrite it.
  const loadSeqRef = useRef(0);
  // True while the rest of the projects are still arriving after the first
  // page has been shown.
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchAll = async (showLoading = true) => {
    if (!currentUserId) return;

    const seq = ++loadSeqRef.current;
    const isCurrent = () => seq === loadSeqRef.current;

    if (showLoading) {
      setLoading(true);
    }

    try {
      // The board and list only show per-project counts, never the nested
      // deliverable documents, so ask the server for counts only
      // (include_deliverables: false). The full payload was over a megabyte
      // for a few hundred projects.
      //
      // Clients and dropdown options are not changed by anything on this
      // page, so only the first full-page load fetches them; the quiet
      // refreshes that follow every create/hide/move/drag skip them.
      //
      // The full client list and the deliverable types only feed the "New
      // project" form, which only admins have. Everyone else gets their
      // client filter from the projects themselves (see clientOptions), so
      // two requests fewer on every open of this page.
      const params = { visibility, include_deliverables: false };

      if (showLoading) {
        // Opening the page: ask for the newest FIRST_PAGE projects only, so
        // the board is on screen as soon as that small answer arrives, then
        // fetch the complete list and swap it in.
        //
        // Both requests are usually already on their way from boot (see
        // services/prefetch); the page picks them up instead of asking again.
        const [first, m] = await Promise.all([
          consumePrefetch(`projects-first:${visibility}`, () =>
            getProjects(currentUserId, { ...params, limit: FIRST_PAGE })
          ),
          consumePrefetch("projects-metrics", () => getProjectMetrics(currentUserId)),
        ]);
        if (!isCurrent()) return;

        setProjects(first);
        setMetrics(m);
        setLoading(false);

        // Admins also need the client list and deliverable types, but only
        // for the "New project" form - so the board is not held back for
        // them. (No isCurrent() check: these are loaded once, and a quiet
        // refresh finishing first must not throw them away.)
        if (canManage) {
          Promise.all([getClients(), getOptions()])
            .then(([c, opts]) => {
              if (c) setClients(c);
              if (opts) setDeliverableTypes(opts.deliverable_types || []);
            })
            .catch(() => toast.error("Could not load clients for the New project form"));
        }

        if (first.length >= FIRST_PAGE) {
          setLoadingMore(true);
          const all = await getProjects(currentUserId, params);
          if (!isCurrent()) return;
          setProjects(all);
        }
      } else {
        const [p, m] = await Promise.all([
          getProjects(currentUserId, params),
          getProjectMetrics(currentUserId),
        ]);
        if (!isCurrent()) return;

        setProjects(p);
        setMetrics(m);
        setLoading(false);
      }
    } catch (err) {
      if (!isCurrent()) return;
      toast.error(
        err?.response?.data?.detail || "Failed to load projects"
      );
    } finally {
      if (isCurrent()) {
        setLoadingMore(false);
        if (showLoading) setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (currentUser) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, currentUser?.role, visibility]);

  // "New project" from the ⌘K palette lands here with this flag set.
  useEffect(() => {
    if (location.state?.openCreate) {
      if (canManage) setModalOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.key]);

  useEffect(() => {
    if (currentUser) {
      trackEvent("projects_opened", {
        role: currentUser.role,
      });
    }
  }, [currentUser?.id]);

  // Client filter choices: admins use the full client list; everyone else
  // gets the clients that actually appear on the projects they can see.
  const clientOptions = useMemo(() => {
    if (canManage) return clients;

    const byId = new Map();
    projects.forEach((p) => {
      if (p.client_id && !byId.has(p.client_id)) {
        byId.set(p.client_id, { id: p.client_id, name: p.client_name || p.client_id });
      }
    });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [canManage, clients, projects]);

  const pocOptions = useMemo(() => {
    return [
      ...new Set(
        projects.map((p) => p.client_poc).filter(Boolean)
      ),
    ].sort();
  }, [projects]);

  // Typing stays instant; the (heavier) re-filtering of the board follows it.
  const deferredSearch = useDeferredValue(search);
  // Deliverable names load on the first search; until then (or while the
  // list is still catching up with the typing) don't claim "no results".
  const searchPending =
    deferredSearch !== search ||
    (Boolean(search.trim()) && deliverableNamesByProject === null);

  // Depends on "has the user typed anything", not the text itself, so a
  // request in flight is not thrown away on every keystroke.
  const hasSearch = Boolean(search.trim());

  useEffect(() => {
    if (!hasSearch || deliverableNamesByProject) return;
    let cancelled = false;

    getDeliverableNamesByProject()
      .then((byProject) => {
        if (cancelled) return;
        setDeliverableNamesByProject(byProject || {});
      })
      .catch(() => {
        // Search still works on project fields; stop waiting on the names.
        if (!cancelled) setDeliverableNamesByProject({});
      });

    return () => {
      cancelled = true;
    };
  }, [hasSearch, deliverableNamesByProject]);

  const {
    filtered,
    lookalikeTextById,
    sortedFiltered,
    byStatus,
  } = useProjectsDerived({ projects, deferredSearch, deliverableNamesByProject, statusFilter, clientFilter, pocFilter, dateFrom, dateTo, sortBy });

  // The sort itself is applied below, once sortContext (which needs the
  // look-alike index) exists, and shared by the list rows and the board.

  // Export the projects currently on screen (search, status, filters and
  // sort all applied) as a CSV.
  const handleExport = () => {
    if (sortedFiltered.length === 0) {
      toast.info("No projects to export");
      return;
    }
    const header = [
      "Code", "Project", "Client", "Contact", "Status", "Deliverables",
      "Content", "Design", "Animate", "Start date", "Deadline", "Visibility",
    ];
    const rows = sortedFiltered.map((p) => {
      const stages = p.stage_counts || {};
      return [
        p.code || "",
        p.name || "",
        p.client_name || "",
        p.client_poc || "",
        p.status || "",
        p.deliverables_count ?? 0,
        stages.Content ?? 0,
        stages.Design ?? 0,
        stages.Animate ?? 0,
        (p.start_date || "").slice(0, 10),
        (p.end_date || "").slice(0, 10),
        p.hidden ? "Hidden" : "Visible",
      ];
    });
    downloadCsv(`projects-${todayStamp()}.csv`, header, rows);
    toast.success(
      `Exported ${rows.length} project${rows.length === 1 ? "" : "s"}`
    );
  };

  useEffect(() => {
    setListPage(1);
  }, [search, statusFilter, clientFilter, pocFilter, dateFrom, dateTo, visibility]);

  const toggleColumnVisibility = (status) => {
    setHiddenColumns((current) => {
      const next = new Set(current);

      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }

      localStorage.setItem(
        "pmt-hidden-project-columns",
        JSON.stringify([...next])
      );

      return next;
    });
  };

  const visibleStatuses = PROJECT_STATUSES.filter(
    (status) => !hiddenColumns.has(status)
  );

  const hiddenStatuses = PROJECT_STATUSES.filter((status) =>
    hiddenColumns.has(status)
  );

  const {
    toggleProjectSelection,
    selectAllFiltered,
    toggleColumnSelection,
    selectPage,
    clearSelection,
  } = useProjectsSelection({ filtered, setSelectedProjects });

  const {
    handleHideProject,
    handleUnhideProject,
    handleBulkHide,
    handleBulkUnhide,
    handleBulkStatusChange,
    handleBulkDelete,
  } = useProjectsBulkActions({ currentUserId, pushUndo, fetchAll, projects, selectedProjects, setSelectedProjects, clearSelection, setDeleteTarget });

  // Status has its own toolbar control, so the panel's badge counts what's
  // inside the panel: the other filters and the sort.
  const activeFilterCount =
    Number(Boolean(sortBy)) +
    Number(Boolean(clientFilter)) +
    Number(Boolean(pocFilter)) +
    Number(Boolean(dateFrom || dateTo)) +
    Number(visibility !== "visible");

  const clearFilters = () => {
    setStatusFilter("");
    setClientFilter("");
    setPocFilter("");
    setDateFrom("");
    setDateTo("");
    setVisibility("visible");
    setSortBy(DEFAULT_SORT);
    clearSelection();
  };

  const handleVisibilityChange = (value) => {
    setVisibility(value);
    clearSelection();
  };

  const {
    handleProjectDragStart,
    handleProjectDragEnd,
    handleProjectDragOver,
    handleColumnDragOver,
    handleProjectDrop,
    handleColumnDrop,
  } = useProjectsDragDrop({ canManage, draggedProjectId, setDraggedProjectId, setDragOverProjectId, setDragOverStatus, projects, setProjects, currentUserId, pushUndo, fetchAll });

  // Permanent-identity versions of the handlers given to the board, so
  // re-rendering this page (modal open, search, selection, drag) doesn't
  // re-render every project card.
  const stableSelectProject = useStableCallback(toggleProjectSelection);
  const stableSelectColumn = useStableCallback(toggleColumnSelection);
  const stableToggleColumn = useStableCallback(toggleColumnVisibility);
  const stableDragStart = useStableCallback(handleProjectDragStart);
  const stableDragEnd = useStableCallback(handleProjectDragEnd);
  const stableDragOver = useStableCallback(handleProjectDragOver);
  const stableDrop = useStableCallback(handleProjectDrop);
  const stableColumnDragOver = useStableCallback(handleColumnDragOver);
  const stableColumnDrop = useStableCallback(handleColumnDrop);
  const stableHideProject = useStableCallback(handleHideProject);
  const stableUnhideProject = useStableCallback(handleUnhideProject);
  const stableDeleteProject = useStableCallback((project) => setDeleteTarget(project));
  const stableOpenProject = useStableCallback((project) => {
    trackEvent("project_opened", {
      project_id: project.id,
      status: project.status,
    });

    navigate(`/projects/${project.id}`);
  });

  if (userLoading || !currentUser) return null;

  const selectionMode = selectedProjects.size > 0;
  const boardWidth =
    visibleStatuses.length * COLUMN_WIDTH + Math.max(0, visibleStatuses.length - 1) * 10;

  const ctx = {
    activeFilterCount,
    boardWidth,
    byStatus,
    canManage,
    clearFilters,
    clearSelection,
    clientFilter,
    clientOptions,
    dateFrom,
    dateTo,
    dragOverProjectId,
    dragOverStatus,
    filtered,
    filtersOpen,
    handleBulkHide,
    handleBulkStatusChange,
    handleBulkUnhide,
    handleExport,
    handleHideProject,
    handleUnhideProject,
    handleVisibilityChange,
    hiddenStatuses,
    listPage,
    loading,
    loadingMore,
    lookalikeTextById,
    metrics,
    pocFilter,
    pocOptions,
    projects,
    search,
    searchPending,
    selectAllFiltered,
    selectPage,
    selectedProjects,
    selectionMode,
    setClientFilter,
    setDateFrom,
    setDateTo,
    setDeleteTarget,
    setFiltersOpen,
    setListPage,
    setModalOpen,
    setPocFilter,
    setSearch,
    setSortBy,
    setStatusFilter,
    setView,
    sortBy,
    sortedFiltered,
    stableColumnDragOver,
    stableColumnDrop,
    stableDeleteProject,
    stableDragEnd,
    stableDragOver,
    stableDragStart,
    stableDrop,
    stableHideProject,
    stableOpenProject,
    stableSelectColumn,
    stableSelectProject,
    stableToggleColumn,
    stableUnhideProject,
    statusFilter,
    toggleColumnVisibility,
    toggleProjectSelection,
    view,
    visibility,
    visibleStatuses,
  };

  return (
    <div
      data-testid={PROJECTS.page}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f6f6f9] px-3 pb-6 pt-[21px] md:px-5"
    >
      <ProjectsToolbar {...ctx} />

      <ProjectsFilterChips {...ctx} />

      <ProjectsBulkBar {...ctx} />

      <ProjectsContent {...ctx} />

      {canManage && (
      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(created) => {
          // Show the new project straight away from the response we already
          // have (mirroring the server: it goes to the top of its column and
          // pushes the others down one), then reconcile quietly in the
          // background instead of waiting on a full reload first.
          if (created?.id && visibility !== "hidden") {
            setProjects((current) => [
              created,
              ...current
                .filter((project) => project.id !== created.id)
                .map((project) =>
                  project.status === created.status
                    ? {
                        ...project,
                        kanban_order: (Number(project.kanban_order) || 0) + 1,
                      }
                    : project
                ),
            ]);
          }

          fetchAll(false);
        }}
        clients={clients}
        projects={projects}
        onClientsChanged={() =>
          getClients()
            .then((c) => setClients(c || []))
            .catch(() => {})
        }
        deliverableTypes={deliverableTypes}
      />
      )}

      {canManage && (
      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={
          deleteTarget === "bulk"
            ? handleBulkDelete
            : async () => {
                try {
                  await deleteProject(currentUserId, deleteTarget.id);

                  toast.success("Project deleted");

                  setDeleteTarget(null);
                  await fetchAll(false);
                } catch (err) {
                  toast.error(
                    err?.response?.data?.detail ||
                      "Failed to delete project"
                  );
                }
              }
        }
        title={
          deleteTarget === "bulk"
            ? `Delete ${selectedProjects.size} projects?`
            : "Delete this project?"
        }
        description={
          deleteTarget === "bulk"
            ? "These projects and their deliverables will be permanently deleted."
            : "This project and its deliverables will be permanently deleted."
        }
        warning="Historical work entries will be preserved."
        confirmLabel="Delete"
      />
      )}
    </div>
  );
}