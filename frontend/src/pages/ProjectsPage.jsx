import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, ChevronDown, Eye, Search, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import { useAccess } from "@/hooks/useAccess";
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

import { PROJECT_STATUSES, PROJECT_STATUS_STYLE } from "@/constants/projectPalette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PROJECTS } from "@/constants/testIds";
import { ProjectStatTile } from "@/components/projects/projectVisuals";
import { COLUMN_WIDTH, KanbanColumn } from "@/components/projects/KanbanColumn";
import { ProjectListTable } from "@/components/projects/ProjectListTable";
import { DEFAULT_SORT, SORT_OPTIONS, sortProjects } from "@/lib/projectSort";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [pocFilter, setPocFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visibility, setVisibility] = useState("visible");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState("chart");
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
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
      //
      // The full client list and the deliverable types only feed the "New
      // project" form, which only admins have. Everyone else gets their
      // client filter from the projects themselves (see clientOptions), so
      // two requests fewer on every open of this page.
      const [p, m, c, opts] = await Promise.all([
        getProjects(currentUserId, {
          visibility,
          include_deliverables: false,
        }),
        getProjectMetrics(currentUserId),
        showLoading && canManage ? getClients() : Promise.resolve(null),
        showLoading && canManage ? getOptions() : Promise.resolve(null),
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
      });
    // Filtering only here — the active "Sort by" choice is applied once,
    // below, and reused for both the list rows and the Kanban columns so
    // the two views never disagree about the order.
  }, [projects, deferredSearch, statusFilter, clientFilter, pocFilter, dateFrom, dateTo]);

  const sortedFiltered = useMemo(
    () => sortProjects(filtered, sortBy),
    [filtered, sortBy]
  );

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(
      PROJECT_STATUSES.map((s) => [s, []])
    );

    filtered.forEach((p) => {
      if (map[p.status]) {
        map[p.status].push(p);
      }
    });

    if (sortBy) {
      // A sort is explicitly chosen: same control and comparator as the
      // list view (see sortedFiltered above), applied within each column.
      // Dragging a card between columns still changes its status as
      // before; dragging to reorder within a column no longer has a
      // visible effect while a sort is active, since the column re-sorts
      // by the chosen criterion on every render.
      Object.keys(map).forEach((status) => {
        map[status] = sortProjects(map[status], sortBy);
      });
    } else {
      // "No sorting": the manual drag order (kanban_order) — restores
      // ordinary drag-to-reorder within a column.
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
    }

    return map;
  }, [filtered, sortBy]);

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
    if (!canManage || !draggedProjectId) return;

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

  return (
    <div
      data-testid={PROJECTS.page}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f6f6f9] px-6 pb-6 pt-[21px]"
    >
      {/* Title + toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-baseline text-[22px] font-bold leading-[27px] text-[#11151c]">
          Projects
          <span className="ml-[9px] text-[13px] font-normal text-[#98a1af]">
            {projects.length}
          </span>
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <label className="flex h-[34px] w-[242px] items-center gap-2 rounded-[8px] border border-[#e1e4ea] bg-white pl-3 pr-2 focus-within:border-[#3b6ef6] focus-within:ring-[3px] focus-within:ring-[#3b6ef6]/15">
            <Search className="h-3 w-3 shrink-0 text-[#a2aab6]" strokeWidth={2.5} />
            <input
              data-testid={PROJECTS.searchInput}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              className="min-w-0 flex-1 border-none bg-transparent text-[12.5px] text-[#11151c] outline-none placeholder:text-[#a2aab6]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="text-[#a2aab6] hover:text-[#4b5563]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>

          {/* Status - a menu rather than a native select so the button is
              only as wide as the current choice, as in the design */}
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid={PROJECTS.statusFilter}
                aria-label="Filter by status"
                className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-[#e1e4ea] bg-white pl-3 pr-[10px] text-[12.5px] text-[#4b5563] outline-none hover:bg-[#fafbfc] focus-visible:ring-[3px] focus-visible:ring-[#3b6ef6]/15"
              >
                {statusFilter && (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: PROJECT_STATUS_STYLE[statusFilter]?.dot }}
                  />
                )}
                {statusFilter || "All status"}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              className="w-48 rounded-[10px] border-[#e7e9ee] p-1 shadow-[0_6px_20px_rgba(17,21,28,0.1)]"
            >
              {["", ...PROJECT_STATUSES].map((s) => (
                <DropdownMenuItem
                  key={s || "all"}
                  onSelect={() => setStatusFilter(s)}
                  className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-[12.5px] text-[#11151c] focus:bg-[#f4f5f7]"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: s ? PROJECT_STATUS_STYLE[s]?.dot : "#c3c8d2" }}
                  />
                  <span className="flex-1">{s || "All status"}</span>
                  {statusFilter === s && <Check className="!h-3.5 !w-3.5 text-[#3b6ef6]" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* More filters + sort (not in the design, kept compact) */}
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                data-testid={PROJECTS.filtersButton}
                aria-label="More filters and sorting"
                title="More filters and sorting"
                className={`relative flex h-[34px] w-[34px] items-center justify-center rounded-[8px] border bg-white outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[#3b6ef6]/15 ${
                  activeFilterCount > 0
                    ? "border-[#3b6ef6] text-[#3b6ef6]"
                    : "border-[#e1e4ea] text-[#4b5563] hover:bg-[#fafbfc]"
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {activeFilterCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#3b6ef6] px-1 text-[9.5px] font-bold text-white">
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
                sortBy={sortBy}
                setSortBy={setSortBy}
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
                clients={clientOptions}
                pocOptions={pocOptions}
                activeFilterCount={activeFilterCount}
                canFilterVisibility={canManage}
                onClear={clearFilters}
                onClose={() => setFiltersOpen(false)}
              />
            </PopoverContent>
          </Popover>

          {/* Kanban / List */}
          <div className="flex h-[30px] items-center rounded-[8px] bg-[#edeff3] p-[2px]">
            {[
              ["chart", "Kanban", PROJECTS.chartViewBtn],
              ["list", "List", PROJECTS.listViewBtn],
            ].map(([key, label, testId]) => (
              <button
                key={key}
                type="button"
                data-testid={testId}
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={`h-[26px] rounded-[6px] px-3 text-[12.5px] transition-colors ${
                  view === key
                    ? "bg-white font-semibold text-[#11151c] shadow-[0_1px_2px_rgba(17,21,28,0.12)]"
                    : "font-medium text-[#6b7280] hover:text-[#11151c]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {canManage && (
            <button
              type="button"
              data-testid={PROJECTS.newProjectBtn}
              onClick={() => setModalOpen(true)}
              className="h-8 rounded-[8px] bg-[#11151c] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#2a303b]"
            >
              + New project
            </button>
          )}
        </div>
      </div>

      {/* Active filter chips (only when something from the filter panel is on) */}
      {(pocFilter || clientFilter || dateFrom || dateTo || visibility !== "visible" || sortBy) && (
        <div className="mt-3 flex shrink-0 flex-wrap items-center gap-1.5">
          {[
            clientFilter && {
              key: "client",
              label: `Client: ${clientOptions.find((c) => c.id === clientFilter)?.name || clientFilter}`,
              clear: () => setClientFilter(""),
            },
            pocFilter && { key: "poc", label: `POC: ${pocFilter}`, clear: () => setPocFilter("") },
            (dateFrom || dateTo) && {
              key: "due",
              label: `Due: ${dateFrom || "Any"} – ${dateTo || "Any"}`,
              clear: () => {
                setDateFrom("");
                setDateTo("");
              },
            },
            visibility !== "visible" && {
              key: "vis",
              label: visibility === "hidden" ? "Hidden projects" : "All projects",
              clear: () => handleVisibilityChange("visible"),
            },
            sortBy && {
              key: "sort",
              label: `Sorted: ${SORT_OPTIONS.find((o) => o.value === sortBy)?.label || sortBy}`,
              clear: () => setSortBy(""),
            },
          ]
            .filter(Boolean)
            .map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                className="inline-flex h-6 items-center gap-1 rounded-full border border-[#dce6fe] bg-[#f4f7ff] px-2.5 text-[11.5px] font-medium text-[#1d4ed8]"
              >
                {chip.label}
                <X className="h-3 w-3" />
              </button>
            ))}
          <button
            type="button"
            onClick={() => {
              clearFilters();
              setSearch("");
            }}
            className="ml-1 text-[11.5px] font-medium text-[#3b6ef6] hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Metrics */}
      <div className="mt-4 grid shrink-0 grid-cols-2 gap-[10px] lg:grid-cols-4">
        <ProjectStatTile
          testId={PROJECTS.metricActive}
          label="Active projects"
          value={metrics?.active_projects ?? 0}
        />
        <ProjectStatTile
          testId={PROJECTS.metricRework}
          label="In rework"
          value={metrics?.in_rework ?? 0}
        />
        <ProjectStatTile
          testId={PROJECTS.metricDueWeek}
          label="Due this week"
          value={metrics?.due_this_week ?? 0}
        />
        <ProjectStatTile
          testId={PROJECTS.metricDeliverables}
          label="Deliverables"
          value={metrics?.total_deliverables ?? 0}
        />
      </div>

      {/* Bulk actions (appear once something is selected) */}
      {canManage && selectionMode && (
        <div className="mt-4 shrink-0">
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
        </div>
      )}

      {/* Content: fills the rest of the page's fixed height (the flex column
          above is capped by AppLayout's <main overflow-hidden>) and scrolls
          on its own, so this never needs to guess the toolbar's height with
          a "100vh - Npx" constant - it just gets whatever space is left.
          The list sits 1px lower than the board, per the design. */}
      <div
        className={`min-h-0 flex-1 overflow-auto ${view === "list" ? "mt-[17px]" : "mt-4"}`}
      >
        {loading ? (
          view === "chart" ? (
            <ProjectsBoardSkeleton />
          ) : (
            <SettingsTableSkeleton columns={7} rows={9} label="Loading projects" />
          )
        ) : filtered.length === 0 ? (
          <div
            data-testid={PROJECTS.emptyState}
            className="rounded-[10px] border border-dashed border-[#dde1e7] bg-white py-16 text-center"
          >
            <p className="text-[13px] font-semibold text-[#11151c]">
              {projects.length === 0 ? "No projects yet" : "No projects match these filters"}
            </p>
            {canManage && projects.length === 0 && (
              <p className="mt-1 text-[12px] text-[#6b7280]">
                Click "+ New project" to create your first one.
              </p>
            )}
          </div>
        ) : view === "chart" ? (
          <>
            {hiddenStatuses.length > 0 && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11.5px] text-[#98a1af]">Hidden columns:</span>
                {hiddenStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleColumnVisibility(status)}
                    className="inline-flex h-6 items-center gap-1.5 rounded-full border border-[#e1e4ea] bg-white px-2.5 text-[11.5px] font-medium text-[#4b5563] hover:border-[#cfddfc] hover:text-[#1d4ed8]"
                  >
                    <Eye className="h-3 w-3" />
                    {status}
                  </button>
                ))}
              </div>
            )}

            {/* Horizontal scroll only - the board's own height is whatever
                its tallest column needs; the Content wrapper above supplies
                the vertical scrollbar, at the page's actual available
                height rather than a guessed one. */}
            <div className="pmt-hscroll overflow-x-auto pb-4">
              <div className="flex items-start gap-[10px]" style={{ minWidth: boardWidth }}>
                {visibleStatuses.map((status) => {
                  const columnProjects = byStatus[status] || [];
                  const allColumnProjectsSelected =
                    columnProjects.length > 0 &&
                    columnProjects.every((project) => selectedProjects.has(project.id));

                  return (
                    <KanbanColumn
                      key={status}
                      status={status}
                      projects={columnProjects}
                      selectedProjects={selectedProjects}
                      selectionMode={selectionMode}
                      onSelectProject={stableSelectProject}
                      onSelectAll={stableSelectColumn}
                      allSelected={allColumnProjectsSelected}
                      onOpenProject={stableOpenProject}
                      onHideProject={stableHideProject}
                      onUnhideProject={stableUnhideProject}
                      onDeleteProject={stableDeleteProject}
                      onToggleVisibility={stableToggleColumn}
                      onDragStartProject={stableDragStart}
                      onDragEndProject={stableDragEnd}
                      onDragOverProject={stableDragOver}
                      onDropProject={stableDrop}
                      onDragOverColumn={stableColumnDragOver}
                      onDropColumn={stableColumnDrop}
                      dragOverProjectId={dragOverProjectId}
                      isDropTarget={dragOverStatus === status}
                      readOnly={!canManage}
                    />
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <ProjectListTable
            projects={sortedFiltered}
            selectedProjects={selectedProjects}
            selectionMode={selectionMode}
            onSelectProject={toggleProjectSelection}
            onSelectPage={selectPage}
            onOpenProject={stableOpenProject}
            onHideProject={handleHideProject}
            onUnhideProject={handleUnhideProject}
            onDeleteProject={(p) => setDeleteTarget(p)}
            onNewProject={() => setModalOpen(true)}
            page={listPage}
            setPage={setListPage}
            readOnly={!canManage}
          />
        )}
      </div>

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