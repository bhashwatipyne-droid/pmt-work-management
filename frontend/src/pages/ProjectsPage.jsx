import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Plus,
  ArrowRight,
  Eye,
  LayoutGrid,
  List,
  X,
  Filter,
} from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  getProjects,
  getProjectMetrics,
  getClients,
  getOptions,
  hideProject,
  unhideProject,
  deleteProject,
  bulkHideProjects,
  bulkUnhideProjects,
  bulkUpdateProjectStatus,
  bulkDeleteProjects,
  reorderProjects,
} from "@/services/api";

import { PROJECT_STATUSES } from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";
import { ProjectMetricCard } from "@/components/projects/ProjectMetricCard";
import { KanbanColumn } from "@/components/projects/KanbanColumn";
import { KanbanBoard } from "@/components/ui/KanbanBoard";
import { ProjectListTable } from "@/components/projects/ProjectListTable";
import { ProjectBulkActionBar } from "@/components/projects/ProjectBulkActionBar";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { trackEvent } from "../analytics";
import { ProjectFilterPanel } from "@/components/projects/ProjectFilterPanel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ProjectsBoardSkeleton, SettingsTableSkeleton } from "@/components/skeletons/Skeletons";

// A function with a permanent identity that always calls the latest version
// of `fn`. Lets the page hand the (memoized) project cards handlers that
// never change, so a page re-render doesn't force every card to re-render,
// while the handlers themselves keep reading the current state.
function useStableCallback(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const {
    currentUser,
    currentUserId,
    users,
    loading: userLoading,
  } = useUser();

  const [projects, setProjects] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [clients, setClients] = useState([]);
  const [deliverableTypes, setDeliverableTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [pocFilter, setPocFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visibility, setVisibility] = useState("visible");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState("chart");
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

  const fetchAll = async (showLoading = true) => {
    if (!currentUserId) return;

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
      const [p, m, c, opts] = await Promise.all([
        getProjects(currentUserId, {
          visibility,
          include_deliverables: false,
        }),
        getProjectMetrics(currentUserId),
        showLoading ? getClients() : Promise.resolve(null),
        showLoading ? getOptions() : Promise.resolve(null),
      ]);

      setProjects(p);
      setMetrics(m);
      if (c) setClients(c);
      if (opts) setDeliverableTypes(opts.deliverable_types || []);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to load projects"
      );
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (currentUser?.role === "admin") fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, currentUser?.role, visibility]);

  useEffect(() => {
    if (currentUser) {
      trackEvent("projects_opened", {
        role: currentUser.role,
      });
    }
  }, [currentUser?.id]);

  const pocOptions = useMemo(() => {
    return [
      ...new Set(
        projects.map((p) => p.client_poc).filter(Boolean)
      ),
    ].sort();
  }, [projects]);

  // Typing stays instant; the (heavier) re-filtering of the board follows it.
  const deferredSearch = useDeferredValue(search);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();

    return projects
      .filter((p) => {
        if (statusFilter && p.status !== statusFilter) return false;

        if (clientFilter && p.client_id !== clientFilter) return false;

        if (
          pocFilter &&
          (p.client_poc || "").toLowerCase() !== pocFilter.toLowerCase()
        ) {
          return false;
        }

        // Filter by project due date
        if (dateFrom && (!p.end_date || p.end_date < dateFrom)) return false;
        if (dateTo && (!p.end_date || p.end_date > dateTo)) return false;

        if (!q) return true;

        return (
          (p.name || "").toLowerCase().includes(q) ||
          (p.code || "").toLowerCase().includes(q) ||
          (p.client_name || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const dateA = new Date(a.start_date || 0).getTime();
        const dateB = new Date(b.start_date || 0).getTime();
        return dateB - dateA;
      });
  }, [projects, deferredSearch, statusFilter, clientFilter, pocFilter, dateFrom, dateTo]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(
      PROJECT_STATUSES.map((s) => [s, []])
    );

    filtered.forEach((p) => {
      if (map[p.status]) {
        map[p.status].push(p);
      }
    });

    Object.values(map).forEach((items) => {
      items.sort((a, b) => {
        const orderA = Number.isFinite(Number(a.kanban_order))
          ? Number(a.kanban_order)
          : Number.MAX_SAFE_INTEGER;
        const orderB = Number.isFinite(Number(b.kanban_order))
          ? Number(b.kanban_order)
          : Number.MAX_SAFE_INTEGER;

        if (orderA !== orderB) return orderA - orderB;

        return new Date(b.start_date || 0).getTime() - new Date(a.start_date || 0).getTime();
      });
    });

    return map;
  }, [filtered]);

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

  const toggleProjectSelection = (projectId) => {
    setSelectedProjects((current) => {
      const next = new Set(current);

      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }

      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedProjects(new Set(filtered.map((p) => p.id)));
  };

  const toggleColumnSelection = (columnProjects) => {
    const projectIds = columnProjects.map((project) => project.id);

    if (projectIds.length === 0) return;

    setSelectedProjects((current) => {
      const next = new Set(current);

      const allSelected = projectIds.every((id) => next.has(id));

      if (allSelected) {
        projectIds.forEach((id) => next.delete(id));
      } else {
        projectIds.forEach((id) => next.add(id));
      }

      return next;
    });
  };

  const selectPage = (ids, checked) => {
    setSelectedProjects((current) => {
      const next = new Set(current);

      ids.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });

      return next;
    });
  };

  const clearSelection = () => {
    setSelectedProjects(new Set());
  };

  const handleHideProject = async (project) => {
    try {
      await hideProject(currentUserId, project.id);

      toast.success("Project hidden");

      setSelectedProjects((current) => {
        const next = new Set(current);
        next.delete(project.id);
        return next;
      });

      await fetchAll(false);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to hide project"
      );
    }
  };

  const handleUnhideProject = async (project) => {
    try {
      await unhideProject(currentUserId, project.id);

      toast.success("Project restored");

      await fetchAll(false);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to unhide project"
      );
    }
  };

  const handleBulkHide = async () => {
    const ids = [...selectedProjects];

    if (!ids.length) return;

    try {
      await bulkHideProjects(currentUserId, ids);

      toast.success(
        `${ids.length} project${ids.length === 1 ? "" : "s"} hidden`
      );

      clearSelection();
      await fetchAll(false);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to hide projects"
      );
    }
  };

  const handleBulkUnhide = async () => {
    const ids = [...selectedProjects];

    if (!ids.length) return;

    try {
      await bulkUnhideProjects(currentUserId, ids);

      toast.success(
        `${ids.length} project${ids.length === 1 ? "" : "s"} restored`
      );

      clearSelection();
      await fetchAll(false);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to restore projects"
      );
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    const ids = [...selectedProjects];

    if (!ids.length || !newStatus) return;

    try {
      await bulkUpdateProjectStatus(
        currentUserId,
        ids,
        newStatus
      );

      toast.success(
        `${ids.length} project${ids.length === 1 ? "" : "s"} moved to ${newStatus}`
      );

      clearSelection();
      await fetchAll(false);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          "Failed to change project status"
      );
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedProjects];

    if (!ids.length) return;

    try {
      await bulkDeleteProjects(currentUserId, ids);

      toast.success(
        `${ids.length} project${ids.length === 1 ? "" : "s"} deleted`
      );

      setDeleteTarget(null);
      clearSelection();
      await fetchAll(false);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to delete projects"
      );
    }
  };

  const activeFilterCount =
    Number(Boolean(statusFilter)) +
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
    clearSelection();
  };

  const handleVisibilityChange = (value) => {
    setVisibility(value);
    clearSelection();
  };

  const getColumnProjectIds = (status) =>
    projects
      .filter((project) => project.status === status)
      .sort((a, b) => {
        const orderA = Number.isFinite(Number(a.kanban_order))
          ? Number(a.kanban_order)
          : Number.MAX_SAFE_INTEGER;
        const orderB = Number.isFinite(Number(b.kanban_order))
          ? Number(b.kanban_order)
          : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return new Date(b.start_date || 0).getTime() - new Date(a.start_date || 0).getTime();
      })
      .map((project) => project.id);

  const handleProjectDragStart = (event, project) => {
    setDraggedProjectId(project.id);
    setDragOverProjectId(null);
    setDragOverStatus(project.status);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/project-id", project.id);
  };

  const handleProjectDragEnd = () => {
    setDraggedProjectId(null);
    setDragOverProjectId(null);
    setDragOverStatus(null);
  };

  const handleProjectDragOver = (event, project) => {
    if (!draggedProjectId || draggedProjectId === project.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverProjectId(project.id);
    setDragOverStatus(project.status);
  };

  const handleColumnDragOver = (event, status) => {
    if (!draggedProjectId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverProjectId(null);
    setDragOverStatus(status);
  };

  const persistProjectDrop = async (status, targetIndex) => {
    if (!draggedProjectId) return;

    const draggedProject = projects.find((project) => project.id === draggedProjectId);
    if (!draggedProject) return;

    const oldStatus = draggedProject.status;
    const sourceIds = getColumnProjectIds(oldStatus).filter(
      (id) => id !== draggedProjectId
    );
    const targetIds = getColumnProjectIds(status).filter(
      (id) => id !== draggedProjectId
    );

    if (oldStatus === status) {
      targetIndex = Math.max(0, Math.min(targetIndex, targetIds.length));
      targetIds.splice(targetIndex, 0, draggedProjectId);
    } else {
      targetIndex = Math.max(0, Math.min(targetIndex, targetIds.length));
      targetIds.splice(targetIndex, 0, draggedProjectId);
    }

    // Optimistic update so the board moves immediately.
    const sourceOrder = oldStatus === status
      ? targetIds
      : sourceIds;
    const targetOrder = targetIds;
    const orderById = new Map();

    if (oldStatus !== status) {
      sourceOrder.forEach((id, index) => orderById.set(id, index));
      targetOrder.forEach((id, index) => orderById.set(id, index));
    } else {
      targetOrder.forEach((id, index) => orderById.set(id, index));
    }

    setProjects((current) =>
      current.map((project) => {
        if (project.id === draggedProjectId) {
          return {
            ...project,
            status,
            kanban_order: targetIndex,
          };
        }

        if (project.status === status && orderById.has(project.id)) {
          return { ...project, kanban_order: orderById.get(project.id) };
        }

        if (oldStatus !== status && project.status === oldStatus && orderById.has(project.id)) {
          return { ...project, kanban_order: orderById.get(project.id) };
        }

        return project;
      })
    );

    try {
      await reorderProjects(currentUserId, draggedProjectId, status, targetIndex);
      toast.success(
        oldStatus === status ? "Project order updated" : `Project moved to ${status}`
      );
      // Refresh data without replacing the Kanban with the full-page loader.
      await fetchAll(false);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Could not move project"
      );
      // Revert/refresh silently without showing the full-page loader.
      await fetchAll(false);
    } finally {
      handleProjectDragEnd();
    }
  };

  const handleProjectDrop = async (event, targetProject) => {
    event.preventDefault();
    event.stopPropagation();

    if (!draggedProjectId || draggedProjectId === targetProject.id) {
      handleProjectDragEnd();
      return;
    }

    const targetProjects = getColumnProjectIds(targetProject.status).filter(
      (id) => id !== draggedProjectId
    );
    const targetIndex = targetProjects.indexOf(targetProject.id);
    await persistProjectDrop(targetProject.status, targetIndex < 0 ? 0 : targetIndex);
  };

  const handleColumnDrop = async (event, status) => {
    event.preventDefault();
    event.stopPropagation();

    if (!draggedProjectId) return;

    const targetIds = getColumnProjectIds(status).filter(
      (id) => id !== draggedProjectId
    );
    await persistProjectDrop(status, targetIds.length);
  };

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
  const stableOpenProject = useStableCallback((project) => {
    trackEvent("project_opened", {
      project_id: project.id,
      status: project.status,
    });

    navigate(`/projects/${project.id}`);
  });

  if (userLoading || !currentUser) return null;

  if (currentUser.role !== "admin") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          Projects is available to Admins only
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[#2b2bb5] transition-colors hover:bg-[#f0f0fd] hover:text-[#1a1a8a]"
        >
          Go to Work Sheet
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div
      data-testid={PROJECTS.page}
      className="flex-1 overflow-auto bg-[#f7f9fc] px-6 py-6 lg:px-8"
    >
      {/* Header */}
      <div className="mb-5">
        {/* Page header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Projects{" "}
              <span className="text-lg font-medium text-muted-foreground">
                {projects.length}
              </span>
            </h1>

            <p className="mt-1 text-base text-muted-foreground">
              Manage projects, deliverables and production timelines.
            </p>
          </div>

          <button
            type="button"
            data-testid={PROJECTS.newProjectBtn}
            onClick={() => setModalOpen(true)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#23239b]"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </div>

        {/* Filters + view switcher */}
        <div className="flex w-full items-center gap-2">
          {/* Search */}
          <div className="min-w-0 flex-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <input
                data-testid={PROJECTS.searchInput}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search project name..."
                className="h-10 w-full rounded-lg border border-input bg-white pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
              />
            </div>
          </div>

          {/* Filters */}
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-testid={PROJECTS.filtersButton || "projects-filters-button"}
                className={[
                  "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium outline-none transition-colors",
                  "focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20",
                  activeFilterCount > 0
                    ? "border-[#2b2bb5] text-[#2b2bb5]"
                    : "border-input text-foreground hover:bg-slate-50",
                ].join(" ")}
              >
                <Filter className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2b2bb5] px-1.5 text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-[360px] rounded-xl border border-slate-200 bg-white p-0 shadow-xl"
            >
              <ProjectFilterPanel
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                clientFilter={clientFilter}
                setClientFilter={setClientFilter}
                pocFilter={pocFilter}
                setPocFilter={setPocFilter}
                dateFrom={dateFrom}
                dateTo={dateTo}
                setDateFrom={setDateFrom}
                setDateTo={setDateTo}
                visibility={visibility}
                setVisibility={handleVisibilityChange}
                clients={clients}
                pocOptions={pocOptions}
                activeFilterCount={activeFilterCount}
                onClear={clearFilters}
                onClose={() => setFiltersOpen(false)}
              />
            </PopoverContent>
          </Popover>

          {/* View switcher — icons only */}
          <div className="flex h-10 shrink-0 items-center rounded-lg border border-input bg-white p-1">
            <button
              type="button"
              data-testid={PROJECTS.chartViewBtn}
              onClick={() => setView("chart")}
              title="Kanban view"
              aria-label="Kanban view"
              className={[
                "flex h-8 w-9 items-center justify-center rounded-md transition-colors",
                view === "chart"
                  ? "bg-[#f0f0ff] text-[#2b2bb5]"
                  : "text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>

            <button
              type="button"
              data-testid={PROJECTS.listViewBtn}
              onClick={() => setView("list")}
              title="List view"
              aria-label="List view"
              className={[
                "flex h-8 w-9 items-center justify-center rounded-md transition-colors",
                view === "list"
                  ? "bg-[#f0f0ff] text-[#2b2bb5]"
                  : "text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Active filter chips */}
      {(pocFilter || clientFilter || statusFilter || dateFrom || dateTo || visibility !== "visible") && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {pocFilter && (
            <button
              type="button"
              onClick={() => setPocFilter("")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              POC: {pocFilter}
              <X className="h-3 w-3" />
            </button>
          )}

          {clientFilter && (
            <button
              type="button"
              onClick={() => setClientFilter("")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              Client: {clients.find((client) => client.id === clientFilter)?.name || clientFilter}
              <X className="h-3 w-3" />
            </button>
          )}

          {statusFilter && (
            <button
              type="button"
              onClick={() => setStatusFilter("")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              Status: {statusFilter}
              <X className="h-3 w-3" />
            </button>
          )}

          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              Due: {dateFrom || "Any"} – {dateTo || "Any"}
              <X className="h-3 w-3" />
            </button>
          )}

          {visibility !== "visible" && (
            <button
              type="button"
              onClick={() => handleVisibilityChange("visible")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              {visibility === "hidden" ? "Hidden projects" : "All projects"}
              <X className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              clearFilters();
              setSearch("");
            }}
            className="ml-1 text-xs font-medium text-[#2b2bb5] hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <ProjectMetricCard
          testId={PROJECTS.metricActive}
          label="Active Projects"
          value={metrics?.active_projects ?? 0}
        />

        <ProjectMetricCard
          testId={PROJECTS.metricRework}
          label="In Rework"
          value={metrics?.in_rework ?? 0}
        />

        <ProjectMetricCard
          testId={PROJECTS.metricDueWeek}
          label="Due This Week"
          value={metrics?.due_this_week ?? 0}
        />

        <ProjectMetricCard
          testId={PROJECTS.metricDeliverables}
          label="Deliverables"
          value={metrics?.total_deliverables ?? 0}
        />
      </div>

      {/* Bulk actions */}
      <ProjectBulkActionBar
        selectedCount={selectedProjects.size}
        totalCount={filtered.length}
        visibility={visibility}
        statuses={PROJECT_STATUSES}
        onSelectAll={selectAllFiltered}
        onHide={handleBulkHide}
        onUnhide={handleBulkUnhide}
        onChangeStatus={handleBulkStatusChange}
        onDelete={() => setDeleteTarget("bulk")}
        onClear={clearSelection}
      />

      {/* Content */}
      {loading ? (
        view === "chart" ? (
          <ProjectsBoardSkeleton />
        ) : (
          <SettingsTableSkeleton columns={7} rows={9} label="Loading projects" />
        )
      ) : filtered.length === 0 ? (
        <div
          data-testid={PROJECTS.emptyState}
          className="rounded-xl border border-dashed border-border bg-card py-16 text-center"
        >
          <p className="text-sm font-medium text-foreground">
            No projects yet
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Click "New Project" to create your first one.
          </p>
        </div>
      ) : view === "chart" ? (
        <>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">
              Kanban View
            </div>

            {hiddenStatuses.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Hidden:</span>

                {hiddenStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleColumnVisibility(status)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-[#c8c8ee] hover:text-[#2b2bb5]"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {status}
                  </button>
                ))}
              </div>
            )}
          </div>

          <KanbanBoard minWidth="1920px">
            {visibleStatuses.map((status) => {
              const columnProjects = byStatus[status] || [];

              const columnProjectIds = columnProjects.map(
                (project) => project.id
              );

              const allColumnProjectsSelected =
                columnProjectIds.length > 0 &&
                columnProjectIds.every((id) => selectedProjects.has(id));

              return (
                <KanbanColumn
                  key={status}
                  status={status}
                  projects={columnProjects}
                  users={users}
                  selectedProjects={selectedProjects}
                  onSelectProject={stableSelectProject}
                  onSelectAll={stableSelectColumn}
                  allSelected={allColumnProjectsSelected}
                  onOpenProject={stableOpenProject}
                  onToggleVisibility={stableToggleColumn}
                  onDragStartProject={stableDragStart}
                  onDragEndProject={stableDragEnd}
                  onDragOverProject={stableDragOver}
                  onDropProject={stableDrop}
                  onDragOverColumn={stableColumnDragOver}
                  onDropColumn={stableColumnDrop}
                  dragOverProjectId={dragOverProjectId}
                  isDropTarget={dragOverStatus === status}
                />
              );
            })}
          </KanbanBoard>
        </>
      ) : (
        <ProjectListTable
          projects={filtered}
          users={users}
          selectedProjects={selectedProjects}
          onSelectProject={toggleProjectSelection}
          onSelectPage={selectPage}
          onOpenProject={(p) => {
            trackEvent("project_opened", {
              project_id: p.id,
              status: p.status,
            });

            navigate(`/projects/${p.id}`);
          }}
          onHideProject={handleHideProject}
          onUnhideProject={handleUnhideProject}
          onDeleteProject={(p) => setDeleteTarget(p)}
          page={listPage}
          setPage={setListPage}
        />
      )}

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
        deliverableTypes={deliverableTypes}
      />

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
    </div>
  );
}