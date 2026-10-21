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
import {
  getProjects,
  getProjectMetrics,
  getClients,
  getOptions,
  getDeliverableNamesByProject,
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
import { COLUMN_WIDTH } from "@/components/projects/KanbanColumn";
import { DEFAULT_SORT, sortProjects } from "@/lib/projectSort";
import { buildLookalikeIndex } from "@/lib/lookalikes";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { trackEvent } from "../analytics";
import { ProjectsContent } from "@/components/projects/page/ProjectsContent";
import { ProjectsBulkBar } from "@/components/projects/page/ProjectsBulkBar";
import { ProjectsFilterChips } from "@/components/projects/page/ProjectsFilterChips";
import { ProjectsToolbar } from "@/components/projects/page/ProjectsToolbar";
import { downloadCsv, todayStamp } from "@/lib/exportCsv";
import { makeMatcher } from "@/lib/search";

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
// board right away while the rest loads.
const FIRST_PAGE = 30;

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
  const [search, setSearch] = useState("");
  // project id -> its deliverable names (lowercase), so the search box can find
  // a project by one of its deliverables. Loaded once, the first time someone
  // types, so opening the page does not pay for it.
  const [deliverableNamesByProject, setDeliverableNamesByProject] = useState(null);
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
        const [first, m, c, opts] = await Promise.all([
          getProjects(currentUserId, { ...params, limit: FIRST_PAGE }),
          getProjectMetrics(currentUserId),
          canManage ? getClients() : Promise.resolve(null),
          canManage ? getOptions() : Promise.resolve(null),
        ]);
        if (!isCurrent()) return;

        setProjects(first);
        setMetrics(m);
        if (c) setClients(c);
        if (opts) setDeliverableTypes(opts.deliverable_types || []);
        setLoading(false);

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

  const filtered = useMemo(() => {
    const match = makeMatcher(deferredSearch);

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
        const endDay = (p.end_date || "").slice(0, 10);
        if (dateFrom && (!endDay || endDay < dateFrom)) return false;
        if (dateTo && (!endDay || endDay > dateTo)) return false;

        return match(
          p.name,
          p.code,
          p.client_name,
          p.description,
          deliverableNamesByProject?.[p.id]
        );
      });
    // Filtering only here — the active "Sort by" choice is applied once,
    // below, and reused for both the list rows and the Kanban columns so
    // the two views never disagree about the order.
  }, [projects, deferredSearch, deliverableNamesByProject, statusFilter, clientFilter, pocFilter, dateFrom, dateTo]);

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

  // "Looks like …" on cards and list rows: names people confuse when they
  // log time. A hint to rename one, or at least add a description.
  const lookalikeIndex = useMemo(() => {
    const clientNames = new Map(projects.map((p) => [p.client_id, p.client_name || ""]));
    return buildLookalikeIndex(projects, (id) => clientNames.get(id) || "");
  }, [projects]);

  const lookalikeTextById = useMemo(() => {
    const texts = new Map();
    lookalikeIndex.forEach((twins, id) => {
      texts.set(
        id,
        `Looks like ${twins[0].name}${twins.length > 1 ? ` +${twins.length - 1}` : ""}`
      );
    });
    return texts;
  }, [lookalikeIndex]);

  // For the "Look-alikes first" sort: projects that look alike share a key
  // (the alphabetically first name in the group), so they land side by side.
  const sortContext = useMemo(() => {
    const lookalikeKeyById = new Map();
    const byId = new Map(projects.map((p) => [p.id, p]));
    lookalikeIndex.forEach((twins, id) => {
      const names = [byId.get(id)?.name, ...twins.map((t) => t.name)]
        .map((n) => String(n || "").trim().toLowerCase())
        .sort();
      lookalikeKeyById.set(id, names[0]);
    });
    return { lookalikeKeyById };
  }, [projects, lookalikeIndex]);

  const sortedFiltered = useMemo(
    () => sortProjects(filtered, sortBy, sortContext),
    [filtered, sortBy, sortContext]
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
        map[status] = sortProjects(map[status], sortBy, sortContext);
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
  }, [filtered, sortBy, sortContext]);

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

      pushUndo("hid project", async () => {
        await unhideProject(currentUserId, project.id);
        await fetchAll(false);
      });
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

      pushUndo("restored project", async () => {
        await hideProject(currentUserId, project.id);
        await fetchAll(false);
      });
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

      pushUndo(`hid ${ids.length} project${ids.length === 1 ? "" : "s"}`, async () => {
        await bulkUnhideProjects(currentUserId, ids);
        await fetchAll(false);
      });
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

      pushUndo(`restored ${ids.length} project${ids.length === 1 ? "" : "s"}`, async () => {
        await bulkHideProjects(currentUserId, ids);
        await fetchAll(false);
      });
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
      // Remember each project's status so it can be put back.
      const statusBefore = new Map();
      projects.forEach((project) => {
        if (ids.includes(project.id)) {
          if (!statusBefore.has(project.status)) statusBefore.set(project.status, []);
          statusBefore.get(project.status).push(project.id);
        }
      });

      await bulkUpdateProjectStatus(
        currentUserId,
        ids,
        newStatus
      );

      pushUndo(`status change on ${ids.length} project${ids.length === 1 ? "" : "s"}`, async () => {
        for (const [oldStatus, oldIds] of statusBefore) {
          await bulkUpdateProjectStatus(currentUserId, oldIds, oldStatus);
        }
        await fetchAll(false);
      });

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
    const oldIndex = getColumnProjectIds(oldStatus).indexOf(draggedProjectId);
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
      const movedId = draggedProjectId;
      pushUndo(oldStatus === status ? "project order change" : "project move", async () => {
        await reorderProjects(currentUserId, movedId, oldStatus, Math.max(0, oldIndex));
        await fetchAll(false);
      });
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