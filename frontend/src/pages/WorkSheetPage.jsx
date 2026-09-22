import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";
import { refreshCounts, onCountsRefresh } from "@/lib/countsBus";
import {
  bulkDeleteWorkItems,
  bulkUpdateWorkItems,
  bulkCreateWorkItems,
  createWorkItem,
  deleteWorkItem,
  getOptions,
  getWorkItems,
  getBulkReviewCount,
  updateWorkItem,
  getClients,
  getProjects,
  getDeliverables,
} from "@/services/api";
import { WorkSheetToolbar } from "@/components/work-sheet/WorkSheetToolbar";
import { WorkSheetTabs } from "@/components/work-sheet/WorkSheetTabs";
import { WorkSheetTable } from "@/components/work-sheet/WorkSheetTable";
import { WorksheetFilterPanel } from "@/components/work-sheet/WorksheetFilterPanel";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { BulkActionBar } from "@/components/work-sheet/BulkActionBar";
import QuickLoggerModal from "../components/work-sheet/QuickLoggerModal";
import BulkReviewModal from "../components/work-sheet/BulkReviewModal";
import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkSheetHistory } from "@/components/work-sheet/WorkSheetHistory";
import { toast } from "sonner";
import { trackEvent } from "@/analytics";
import {
  DELIVERABLE_GATED_STATUSES,
  DELIVERABLE_REQUIRED_MESSAGE,
  isDeliverableMissing,
} from "@/lib/deliverableRules";
import {
  TIME_GATED_STATUSES,
  TIME_REQUIRED_MESSAGE,
  hasTime,
  parseTimeInput,
} from "@/lib/timeRules";
import { WorkSheetSkeleton, WorkSheetTableSkeleton } from "@/components/skeletons/Skeletons";

const emptyFilters = {
  search: "",
  status: "",
  deliverable_type: "",
  work_category: "",
  month: "",

  date_from: "",
  date_to: "",

  project_ids: [],
  deliverable_ids: [],
  stages: [],
  deliverable_types: [],
  work_categories: [],
  creator_ids: [],
  reviewer_ids: [],
  statuses: [],
};
const LS = { client: "ws_last_client_id", project: "ws_last_project_id", deliverable: "ws_last_deliverable_id", stage: "ws_last_stage" };
const DEPARTMENT_TO_STAGE = {
  Content: "Content",
  Design: "Design",
  Animation: "Animate",
};

const trackWorksheetContext = (item, previousItem, patch) => {
  const contextFields = [
    "client_id",
    "project_id",
    "deliverable_id",
    "deliverable_not_available",
  ];

  // Do not track unrelated edits such as remarks, status, date, etc.
  const changedContextField = contextFields.some(
    (field) => patch[field] !== undefined
  );

  if (!changedContextField || !item) return;

  const hasClient = Boolean(item.client_id);
  const hasProject = Boolean(item.project_id);
  const hasDeliverable = Boolean(
    item.deliverable_id || item.deliverable_not_available
  );

  const previousHasClient = Boolean(previousItem?.client_id);
  const previousHasProject = Boolean(previousItem?.project_id);
  const previousHasDeliverable = Boolean(
    previousItem?.deliverable_id || previousItem?.deliverable_not_available
  );

  const contextStatus =
    hasClient && hasProject && hasDeliverable
      ? "complete"
      : hasClient && !hasProject && !hasDeliverable
        ? "client_only"
        : !hasClient
          ? "missing_client"
          : "incomplete";

  // Avoid repeatedly tracking the same incomplete state on every edit.
  const contextChanged =
    hasClient !== previousHasClient ||
    hasProject !== previousHasProject ||
    hasDeliverable !== previousHasDeliverable;

  if (!contextChanged) return;

  trackEvent("worksheet_context_saved", {
    row_id: item.id,
    context_status: contextStatus,
    has_client: hasClient,
    has_project: hasProject,
    has_deliverable: hasDeliverable,
    deliverable_not_available: Boolean(item.deliverable_not_available),
    missing_fields: [
      ...(!hasClient ? ["client"] : []),
      ...(!hasProject ? ["project"] : []),
      ...(!hasDeliverable ? ["deliverable"] : []),
    ],
  });
};

export default function WorkSheetPage() {
  const { currentUser, currentUserId, users, loading: userLoading } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [activeSheet, setActiveSheet] = useState("Master");
  const [options, setOptions] = useState({});
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [deliverables, setDeliverables] = useState([]);

  // Filters are scoped to each worksheet tab so a filter applied on one
  // sheet does not leak into another sheet.
  const [filtersBySheet, setFiltersBySheet] = useState(() => {
    const createFilters = () => ({
      ...emptyFilters,
      project_ids: [],
      deliverable_ids: [],
      stages: [],
      deliverable_types: [],
      work_categories: [],
      creator_ids: [],
      reviewer_ids: [],
      statuses: [],
    });

    return {
      Master: createFilters(),
      Content: createFilters(),
      Design: createFilters(),
      Animation: createFilters(),
    };
  });

  const filters = filtersBySheet[activeSheet] || emptyFilters;

  const setFilters = useCallback(
    (nextFilters) => {
      setFiltersBySheet((current) => {
        const currentSheetFilters = current[activeSheet] || emptyFilters;
        const resolvedFilters =
          typeof nextFilters === "function"
            ? nextFilters(currentSheetFilters)
            : nextFilters;

        return {
          ...current,
          [activeSheet]: resolvedFilters,
        };
      });
    },
    [activeSheet]
  );

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortDirection, setSortDirection] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [hiddenRows, setHiddenRows] = useState(() => {
    try {
      const saved = localStorage.getItem("worksheet_hidden_rows");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [bulkAdding, setBulkAdding] = useState(false);
  const [addingRow, setAddingRow] = useState(false);
  const [quickLoggerOpen, setQuickLoggerOpen] = useState(false);
  const [bulkReviewOpen, setBulkReviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [hideRowsErrorOpen, setHideRowsErrorOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const bulkAddingRef = useRef(false);
  const addingRowRef = useRef(false);
  const itemsRef = useRef(items);
  const tableRef = useRef(null);
  const isAdmin = currentUser?.role === "admin";
  const isManager = currentUser?.role === "manager";
  const isMember = currentUser?.role === "member";

  // Admins are view-only on the Work Sheet. Managers/members can only add
  // rows to their own department's stage, or to Master (which resolves to
  // their own department's stage anyway).
  const canAddToActiveSheet =
    currentUser?.role !== "admin" &&
    (activeSheet === "Master" ||
      activeSheet === DEPARTMENT_TO_STAGE[currentUser?.department]);

  const [bulkReviewCount, setBulkReviewCount] = useState(0);

  // Extracted (rather than kept inline in the effect below) so the Bulk
  // Review modal's onClose can also call it directly for an immediate
  // refresh — otherwise the badge would lag up to 15s behind an action
  // that just changed it, which is exactly the moment it's most likely
  // to be stale.
  const fetchBulkReviewCount = useCallback(() => {
    if (!currentUser?.id || !isManager) return;

    getBulkReviewCount(currentUser.id)
      .then((data) => setBulkReviewCount(data?.count || 0))
      .catch(() => {});
  }, [currentUser?.id, isManager]);

  // Same audience as the Bulk Review button itself (isManager ? ... :
  // undefined, below) — admins can technically call the endpoint too, but
  // the button is manager-only, so there's no point polling for a count
  // admins would never see a badge for. The 5s interval is a safety net
  // for changes made elsewhere (another manager, another tab); this
  // user's own actions refresh it instantly via the countsBus event.
  useEffect(() => {
    if (!currentUser?.id || !isManager) return undefined;

    fetchBulkReviewCount();
    const timer = window.setInterval(fetchBulkReviewCount, 5000);
    const unsubscribe = onCountsRefresh(fetchBulkReviewCount);

    return () => {
      window.clearInterval(timer);
      unsubscribe();
    };
  }, [currentUser?.id, isManager, fetchBulkReviewCount]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    localStorage.setItem(
      "worksheet_hidden_rows",
      JSON.stringify(hiddenRows)
    );
  }, [hiddenRows]);

  useEffect(() => { getOptions().then(setOptions); }, []);

  useEffect(() => {
    if (!currentUserId) return;
    Promise.all([getClients(), getProjects(currentUserId), getDeliverables(currentUserId)])
      .then(([c, p, d]) => { setClients(c); setProjects(p); setDeliverables(d); })
      .catch(() => {});
  }, [currentUserId]);

  const fetchItems = (showLoading = true) => {
    if (!currentUser) return;
    if (showLoading) {
      setLoading(true);
    }

    // Fetches the whole dataset once, unfiltered. Every filter and tab
    // switch below is applied client-side against this single copy —
    // no network round-trip per filter change, so it's instant instead
    // of waiting on a request each time (and immune to a slow/sleeping
    // backend instance).
    getWorkItems(currentUser.id, {})
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
      })
      .catch(() => toast.error("Could not load work items"))
      .finally(() => {
        if (showLoading) {
          setLoading(false);
        }
      });
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // A notification's "Add row" action creates the work item server-side
  // from a different part of the tree (NotificationCenter, mounted in
  // AppLayout) and then navigates here. Since this page loads `items`
  // once on mount and doesn't poll, navigating to a route we're already
  // on wouldn't otherwise trigger a refetch — the new row would exist in
  // the database but never appear until a manual reload. The notification
  // flags that with router state; consume it once, then clear it so a
  // normal visit to "/" later doesn't keep re-triggering this.
  //
  // Refresh silently (showLoading=false): the row was already created
  // before we navigated here, so there's real data to show immediately —
  // swapping the whole table for "Loading rows..." on arrival is jarring
  // and unnecessary, same as the equivalent fix on the Projects Kanban.
  useEffect(() => {
    if (location.state?.refreshWorkSheet) {
      fetchItems(false);
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.key]);

  // Selection is tied to whatever's currently visible — clear it whenever
  // the visible set could change underneath it, even though this no
  // longer triggers a refetch.
  useEffect(() => {
    setSelectedIds([]);
  }, [filters, activeSheet]);

  // All filtering (search, date range, project/deliverable/type/category,
  // creator, reviewer, status) plus the per-tab stage scoping happens here,
  // client-side, against the single fetched copy of `items` — this is what
  // makes applying a filter instant rather than waiting on a server round
  // trip.
  const filteredItems = useMemo(() => {
    const sheetStage =
      activeSheet === "Master"
        ? null
        : (DEPARTMENT_TO_STAGE[activeSheet] || activeSheet).trim().toLowerCase();

    const selectedStages =
      activeSheet === "Master" && filters.stages?.length
        ? new Set(filters.stages.map((s) => String(s).trim().toLowerCase()))
        : null;

    const search = (filters.search || "").trim().toLowerCase();
    const projectIds = filters.project_ids?.length ? new Set(filters.project_ids) : null;
    const deliverableIds = filters.deliverable_ids?.length ? new Set(filters.deliverable_ids) : null;
    const deliverableTypes = filters.deliverable_types?.length ? new Set(filters.deliverable_types) : null;
    const workCategories = filters.work_categories?.length ? new Set(filters.work_categories) : null;
    const creatorIds = filters.creator_ids?.length ? new Set(filters.creator_ids) : null;
    const reviewerIds = filters.reviewer_ids?.length ? new Set(filters.reviewer_ids) : null;
    const statuses = filters.statuses?.length ? new Set(filters.statuses) : null;

    return items.filter((item) => {
      const itemStage = String(item.stage || "").trim().toLowerCase();

      // Department sheets are hard-scoped to their own stage. Master can
      // optionally scope to a Stage selection from the filter panel.
      if (sheetStage) {
        if (itemStage !== sheetStage) return false;
      } else if (selectedStages && !selectedStages.has(itemStage)) {
        return false;
      }

      if (search) {
        const haystack = `${item.deliverable_name || ""} ${item.remarks || ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      if (filters.date_from && (item.work_date || "") < filters.date_from) return false;
      if (filters.date_to && (item.work_date || "") > filters.date_to) return false;
      if (filters.month && item.month !== filters.month) return false;

      if (projectIds && !projectIds.has(item.project_id)) return false;
      if (deliverableIds && !deliverableIds.has(item.deliverable_id)) return false;
      if (deliverableTypes && !deliverableTypes.has(item.deliverable_type)) return false;
      if (workCategories && !workCategories.has(item.work_category)) return false;
      if (creatorIds && !creatorIds.has(item.creator_id)) return false;
      if (reviewerIds && !reviewerIds.has(item.reviewer_id)) return false;
      if (statuses && !statuses.has(item.status)) return false;

      return true;
    });
  }, [items, filters, activeSheet]);

  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      const dateA = a.work_date || "";
      const dateB = b.work_date || "";

      if (dateA !== dateB) {
        return sortDirection === "desc"
          ? dateB.localeCompare(dateA)
          : dateA.localeCompare(dateB);
      }

      // Same work_date: break the tie by creation time, newest first,
      // so a just-added row doesn't get lost among older same-day rows
      // (matters most after a re-fetch, e.g. following hide/unhide).
      const createdA = a.created_at || "";
      const createdB = b.created_at || "";
      return createdB.localeCompare(createdA);
    });
  }, [filteredItems, sortDirection]);

  const activeFilterCount =
    Number(Boolean(filters.date_from || filters.date_to)) +
    (filters.project_ids?.length || 0) +
    (filters.deliverable_ids?.length || 0) +
    (filters.stages?.length || 0) +
    (filters.deliverable_types?.length || 0) +
    (filters.work_categories?.length || 0) +
    (filters.creator_ids?.length || 0) +
    (filters.reviewer_ids?.length || 0) +
    (filters.statuses?.length || 0);

  const handleAddRow = async () => {
    if (!canAddToActiveSheet) {
      toast.error(
        `You cannot add rows to the ${activeSheet} sheet.`
      );
      return;
    }

    if (addingRowRef.current) return; // guards against rapid double-clicks on the + button
    addingRowRef.current = true;
    setAddingRow(true);
    try {
      const created = await createWorkItem(currentUser.id, {
        work_date: new Date().toISOString().slice(0, 10),
        deliverable_name: "",
        deliverable_type: "",
        work_category: "",
        creator_id: currentUser.id,
        status: "Not Started",
        client_id: null,
        project_id: null,
        deliverable_id: null,
        stage:
          activeSheet === "Master"
            ? (DEPARTMENT_TO_STAGE[currentUser.department] || null)
            : (DEPARTMENT_TO_STAGE[activeSheet] || activeSheet),
      });
      // A per-column sort (set via a column header's "Sort Asc/Desc" menu)
      // would otherwise decide where this row lands, hiding it from the
      // top. Clear it so the sheet falls back to its default order —
      // newest first — where the new row is guaranteed to be visible.
      tableRef.current?.resetColumnSort();

      // The new row is inserted at the top of the (correctly-ordered) data,
      // but if the sheet is scrolled further down, the virtualized table
      // won't show it — which looks identical to "it got added at the
      // bottom" even though the underlying order is right. Scroll back up
      // so the row is actually visible.
      tableRef.current?.scrollToTop();

      // New row goes to the top of the sheet, not the bottom.
      setItems((prev) => [created, ...prev]);

      trackEvent("row_added", {
        worksheet: activeSheet,
        row_id: created.id,
      });

      toast.success("Row added");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not add row");
    } finally {
      addingRowRef.current = false;
      setAddingRow(false);
      refreshCounts();
    }
  };

  const handleQuickLoggerSave = async (payloads) => {
    for (const payload of payloads) {
      const created = await createWorkItem(currentUser.id, payload);

      trackEvent("task_created", {
        task_id: created.id,
      });
    }

    await fetchItems();
    refreshCounts();
  };

  const handleBulkAddRows = async (count) => {
    if (!canAddToActiveSheet) {
      toast.error(
        `You cannot add rows to the ${activeSheet} sheet.`
      );
      return;
    }

    if (bulkAddingRef.current) return; // synchronous guard — blocks rapid/duplicate clicks before React re-renders
    bulkAddingRef.current = true;
    setBulkAdding(true);
    try {
      const stage =
        activeSheet === "Master"
          ? (DEPARTMENT_TO_STAGE[currentUser.department] || null)
          : (DEPARTMENT_TO_STAGE[activeSheet] || activeSheet);
      const created = await bulkCreateWorkItems(
        currentUser.id,
        count,
        { stage }
      );
      setItems((prev) => [...prev, ...created]);

      trackEvent("row_added", {
        worksheet: activeSheet,
        count: created.length,
        bulk: true,
      });

      toast.success(`${created.length} rows added`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not add rows");
    } finally {
      bulkAddingRef.current = false;
      setBulkAdding(false);
      refreshCounts();
    }
  };

  // Wrapped in useCallback so its reference is stable across WorkSheetPage
  // re-renders (which happen on every edit via setItems). Reads the revert
  // snapshot from itemsRef instead of closing over `items`, so `items` can
  // safely stay out of the dependency array.
  const handleUpdate = useCallback(async (id, patch) => {
    const currentItem = itemsRef.current.find(
      (item) => item.id === id
    );

    if (
      currentUser.role === "member" &&
      patch.status === "Ready for Review" &&
      !currentItem?.reviewer_id
    ) {
      toast.error(
        "Please assign a reviewer before marking this as Ready for Review."
      );

      return {
        success: false,
        validation: true,
      };
    }

    // Mirrors the backend rule: a row with a project needs a deliverable (or
    // "Not available") before it can leave Not Started.
    if (
      patch.status &&
      DELIVERABLE_GATED_STATUSES.includes(patch.status) &&
      patch.status !== currentItem?.status &&
      isDeliverableMissing(
        { ...currentItem, ...patch },
        options.deliverable_type_categories
      )
    ) {
      toast.error(DELIVERABLE_REQUIRED_MESSAGE);

      return {
        success: false,
        validation: true,
      };
    }

    // Mirrors the backend time rule: a row needs time before it moves forward.
    // Only refused here when nothing could fill it - with a deliverable type the
    // server pre-fills the person's benchmark, so that case is left to it.
    if (
      patch.status &&
      TIME_GATED_STATUSES.includes(patch.status) &&
      patch.status !== currentItem?.status
    ) {
      const merged = { ...currentItem, ...patch };
      if (!hasTime(merged) && !merged.deliverable_type) {
        toast.error(TIME_REQUIRED_MESSAGE);

        return {
          success: false,
          validation: true,
        };
      }
    }

    const previous = itemsRef.current.find((item) => item.id === id);

    // Optimistically update the UI immediately.
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      )
    );

    if (patch.project_id !== undefined) {
      localStorage.setItem(LS.project, patch.project_id || "");
    }

    if (patch.deliverable_id !== undefined) {
      localStorage.setItem(
        LS.deliverable,
        patch.deliverable_id || ""
      );
    }

    if (patch.stage !== undefined) {
      localStorage.setItem(LS.stage, patch.stage || "");
    }

    try {
      // IMPORTANT:
      // Keep the actual MongoDB response instead of treating the
      // optimistic React update as proof that persistence succeeded.
      const updated = await updateWorkItem(
        currentUser.id,
        id,
        patch
      );

      // The backend returns the complete updated work item.
      // Use it as the source of truth once persistence succeeded.
      const persistedItem = updated || {
        ...currentItem,
        ...patch,
      };

      if (updated) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? updated : item
          )
        );
      }

      trackWorksheetContext(persistedItem, currentItem, patch);

      trackEvent("cell_edited", {
        row_id: id,
        fields: Object.keys(patch),
      });

      if (patch.status && currentItem?.status !== patch.status) {
        trackEvent("task_status_changed", {
          row_id: id,
          old_status: currentItem?.status,
          new_status: patch.status,
        });
        // A status change is exactly what the sidebar's "not closed" count
        // and the Bulk Review badge track — refresh them immediately
        // instead of waiting on their own poll tick.
        refreshCounts();
      }

      return {
        success: true,
        item: updated,
      };
    } catch (e) {
      // Revert only this row if MongoDB/API persistence fails.
      if (previous) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? previous : item
          )
        );
      }

      toast.error(
        e.response?.data?.detail || "Update failed"
      );

      return {
        success: false,
        error: e,
      };
    }
  }, [currentUser, options]);

  const handleDelete = async (item) => {
    if (!item?.id) return;

    setDeleting(true);

    try {
      await deleteWorkItem(currentUser.id, item.id);

      setItems((prev) => prev.filter((row) => row.id !== item.id));

      toast.success("Entry deleted");
      setDeleteTarget(null);
      refreshCounts();
    } catch (e) {
      toast.error(
        e.response?.data?.detail || "Could not delete entry"
      );
    } finally {
      setDeleting(false);
    }
  };

  // Wrapped in useCallback for the same reason as handleUpdate — stable
  // identity, snapshot read from itemsRef rather than the closed-over
  // `items` state.
  const handleFill = useCallback(async (targetIds, field, value) => {
    if (!targetIds.length || !field) return;

    // The server skips rows it refuses without saying so, so a time it would
    // refuse is stopped here where the user can be told why.
    if (field === "time_taken_minutes") {
      const parsed = parseTimeInput(value);
      if (!parsed.ok) {
        toast.error(parsed.message);
        return;
      }
    }

    const previous = itemsRef.current
      .filter((item) => targetIds.includes(item.id))
      .map((item) => ({
        id: item.id,
        value: item[field],
      }));

    // Optimistic UI update.
    setItems((prev) =>
      prev.map((item) =>
        targetIds.includes(item.id)
          ? { ...item, [field]: value }
          : item
      )
    );

    try {
      const updated = await bulkUpdateWorkItems(
        currentUser.id,
        targetIds,
        { [field]: value }
      );

      const updatedById = Object.fromEntries(
        updated.map((item) => [item.id, item])
      );

      setItems((prev) =>
        prev.map((item) =>
          updatedById[item.id] || item
        )
      );
    } catch (e) {
      // Revert only affected cells.
      setItems((prev) =>
        prev.map((item) => {
          const original = previous.find(
            (entry) => entry.id === item.id
          );

          if (!original) return item;

          return {
            ...item,
            [field]: original.value,
          };
        })
      );

      toast.error(
        e.response?.data?.detail ||
          "Could not fill cells"
      );
      throw e;
    }
  }, [currentUser]);

  const toggleSelect = (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));

  // Used by the worksheet's checkbox Shift+Down/Up bulk-select: replaces
  // the selection outright with the anchor-to-target range, same as a
  // spreadsheet's row-header drag/shift-click.
  const handleSelectRange = (ids) => setSelectedIds(ids);
  const handleHideRows = () => {
    if (!selectedIds.length) return;

    const visibleIds = filteredItems.map((item) => item.id);
    const selectedSet = new Set(selectedIds);
    const hiddenSet = new Set(hiddenRows);

    const wouldHideEveryVisibleRow =
      visibleIds.length > 0 &&
      visibleIds.every(
        (id) => selectedSet.has(id) || hiddenSet.has(id)
      );

    if (wouldHideEveryVisibleRow) {
      setHideRowsErrorOpen(true);
      return;
    }

    setHiddenRows((current) => [
      ...new Set([...current, ...selectedIds]),
    ]);

    setSelectedIds([]);
  };

  const handleInsertRow = async (position) => {
    if (!canAddToActiveSheet) {
      toast.error(`You cannot add rows to the ${activeSheet} sheet.`);
      return;
    }

    if (!selectedIds.length) return;

    // Anchor on whichever selected row is currently topmost/bottommost in
    // the visible order — "insert above/below" a multi-row selection reads
    // naturally as "above the whole block" / "below the whole block."
    const selectedSet = new Set(selectedIds);
    const selectedIndices = sortedItems.reduce((acc, item, idx) => {
      if (selectedSet.has(item.id)) acc.push(idx);
      return acc;
    }, []);

    if (!selectedIndices.length) return;

    const anchorIndex =
      position === "above"
        ? Math.min(...selectedIndices)
        : Math.max(...selectedIndices);
    const anchorItem = sortedItems[anchorIndex];
    if (!anchorItem) return;

    try {
      const created = await createWorkItem(currentUser.id, {
        work_date: new Date().toISOString().slice(0, 10),
        deliverable_name: "",
        deliverable_type: "",
        work_category: "",
        creator_id: currentUser.id,
        status: "Not Started",
        client_id: null,
        project_id: null,
        deliverable_id: null,
        stage:
          activeSheet === "Master"
            ? (DEPARTMENT_TO_STAGE[currentUser.department] || null)
            : (DEPARTMENT_TO_STAGE[activeSheet] || activeSheet),
      });

      setItems((prev) => [created, ...prev]);
      // Land the new row next to the anchor in the same manual drag order
      // that reordering rows already maintains, rather than wherever the
      // default date sort would place it.
      tableRef.current?.resetColumnSort();
      tableRef.current?.insertRowNear(created.id, anchorItem.id, position);

      trackEvent("row_added", {
        worksheet: activeSheet,
        row_id: created.id,
        inserted: position,
      });

      toast.success(
        position === "above" ? "Row inserted above" : "Row inserted below"
      );
      refreshCounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not insert row");
    }
  };

  const handleDuplicateRow = async (item) => {
    if (!item) return;

    try {
      const created = await createWorkItem(currentUser.id, {
        work_date: new Date().toISOString().slice(0, 10),
        deliverable_name: item.deliverable_name || "",
        deliverable_type: item.deliverable_type || "",
        deliverable_link: item.deliverable_link || "",
        work_category: item.work_category || "",
        version: item.version || "",
        quantity: 1.0,
        time_taken_minutes: 0,
        creator_id: currentUser.id,
        reviewer_id: item.reviewer_id || null,
        manager_id: item.manager_id || null,
        client_id: item.client_id || null,
        project_id: item.project_id || null,
        deliverable_id: item.deliverable_id || null,
        deliverable_not_available: Boolean(item.deliverable_not_available),
        stage: item.stage || null,
        remarks: "",
        status: "Not Started",
      });

      setItems((prev) => [created, ...prev]);
      tableRef.current?.resetColumnSort();
      tableRef.current?.scrollToTop();

      trackEvent("row_added", {
        worksheet: activeSheet,
        row_id: created.id,
        duplicated_from: item.id,
      });

      toast.success("Row duplicated");
      refreshCounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not duplicate row");
    }
  };


  const toggleSelectAll = () => {
    const visibleIds = filteredItems.map((item) => item.id);

    setSelectedIds((prev) => {
      const allSelected =
        visibleIds.length > 0 &&
        visibleIds.every((id) => prev.includes(id));

      if (allSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }

      return [...new Set([...prev, ...visibleIds])];
    });
  };

  const handleDateSort = useCallback(() => {
    setSortDirection((current) => (current === "desc" ? "asc" : "desc"));
  }, []);

  const handleBulkStatus = async (status) => {
    try {
      const updated = await bulkUpdateWorkItems(currentUser.id, selectedIds, { status });
      const byId = Object.fromEntries(updated.map((u) => [u.id, u]));
      setItems((prev) => prev.map((it) => byId[it.id] || it));
      toast.success(`Updated ${updated.length} row${updated.length === 1 ? "" : "s"}`);
      setSelectedIds([]);
      refreshCounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Bulk update failed");
    }
  };

  const handleBulkAssign = async (patch) => {
    try {
      const updated = await bulkUpdateWorkItems(currentUser.id, selectedIds, patch);
      const byId = Object.fromEntries(updated.map((u) => [u.id, u]));
      setItems((prev) => prev.map((it) => byId[it.id] || it));
      toast.success(`Assigned ${updated.length} row${updated.length === 1 ? "" : "s"}`);
      setSelectedIds([]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Bulk assign failed");
    }
  };

  const handleBulkDelete = () => {
    if (!selectedIds.length) return;
    setBulkDeleteConfirmOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (!selectedIds.length) return;

    setDeleting(true);

    try {
      const idsToDelete = [...selectedIds];

      const { deleted_count } = await bulkDeleteWorkItems(
        currentUser.id,
        idsToDelete
      );

      setItems((prev) =>
        prev.filter((item) => !idsToDelete.includes(item.id))
      );

      trackEvent("row_deleted", {
        worksheet: activeSheet,
        count: idsToDelete.length,
        bulk: true,
      });

      toast.success(
        `Deleted ${deleted_count} row${deleted_count === 1 ? "" : "s"}`
      );

      setSelectedIds([]);
      setBulkDeleteConfirmOpen(false);
      refreshCounts();
    } catch (e) {
      toast.error(
        e.response?.data?.detail || "Bulk delete failed"
      );
    } finally {
      setDeleting(false);
    }
  };

  // Delete key deletes checkbox-selected rows (same confirm flow as the
  // "Delete" button in BulkActionBar). Previously nothing was wired to
  // this at all — selecting rows and pressing Delete did nothing.
  // Also handles Backspace: on Mac keyboards the key labeled "delete"
  // sends event.key "Backspace", not "Delete" — real "Delete" only comes
  // from Fn+Delete (forward-delete) — so Backspace has to be treated the
  // same way here or this never fires on a Mac.
  // Skipped while typing in any editable field: per-cell Delete already
  // has its own handler (clears just that cell) and stops the event from
  // reaching here, but we still guard explicitly in case focus is inside
  // some other input (e.g. a modal or the filter panel) so a stray
  // Delete/Backspace press there can't wipe out a checkbox selection
  // unexpectedly, and so Backspace doesn't trigger the browser's
  // back-navigation in that case either.
  useEffect(() => {
    const isEditableTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      const role = el.getAttribute?.("role");
      if (role === "combobox" || role === "textbox") return true;
      return false;
    };

    const handleGlobalKeyDown = (event) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (!selectedIds.length) return;
      if (isEditableTarget(event.target)) return;
      if (
        quickLoggerOpen ||
        bulkReviewOpen ||
        historyOpen ||
        deleteTarget ||
        bulkDeleteConfirmOpen
      ) {
        return;
      }

      event.preventDefault();
      handleBulkDelete();
    };

    document.addEventListener("keydown", handleGlobalKeyDown);
    return () => document.removeEventListener("keydown", handleGlobalKeyDown);
  }, [
    selectedIds,
    quickLoggerOpen,
    bulkReviewOpen,
    historyOpen,
    deleteTarget,
    bulkDeleteConfirmOpen,
  ]);

  if (userLoading || !currentUser) {
    return <WorkSheetSkeleton />;
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <WorkSheetToolbar
        filters={filters}
        setFilters={setFilters}
        options={options}
        onOpenFilters={() => setFiltersOpen((current) => !current)}
        activeFilterCount={activeFilterCount}
        onAddRow={handleAddRow}
        canAdd={canAddToActiveSheet}
        resultCount={filteredItems.length}
        onBulkAdd={isAdmin ? undefined : handleBulkAddRows}
        bulkAdding={bulkAdding}
        onOpenQuickLogger={
          isManager || isMember ? () => setQuickLoggerOpen(true) : undefined
        }
        onOpenBulkReview={
          isManager ? () => setBulkReviewOpen(true) : undefined
        }
        bulkReviewCount={bulkReviewCount}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      <WorksheetFilterPanel
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        setFilters={setFilters}
        options={options}
        projects={projects}
        deliverables={deliverables}
        users={users}
      />

      <WorkSheetTabs
        activeSheet={activeSheet}
        onChange={setActiveSheet}
      />

      <QuickLoggerModal
        open={quickLoggerOpen}
        onClose={() => setQuickLoggerOpen(false)}
        currentUser={currentUser}
        projects={projects}
        deliverables={deliverables}
        clients={clients}
        options={options}
        onSave={handleQuickLoggerSave}
      />

      <BulkReviewModal
        open={bulkReviewOpen}
        onClose={() => {
          setBulkReviewOpen(false);
          fetchBulkReviewCount();
          refreshCounts();
        }}
        currentUser={currentUser}
      />

      <WorkSheetHistory
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        stage={activeSheet}
      />

      {selectedIds.length > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.length}
          currentUser={currentUser}
          options={options}
          projects={projects}
          deliverables={deliverables}
          onApplyStatus={handleBulkStatus}
          onApplyAssign={handleBulkAssign}
          onHideRows={handleHideRows}
          onInsertAbove={() => handleInsertRow("above")}
          onInsertBelow={() => handleInsertRow("below")}
          onDelete={handleBulkDelete}
          onClear={() => setSelectedIds([])}
        />
      )}

      {loading ? (
        <WorkSheetTableSkeleton />
      ) : (
        <WorkSheetTable
          ref={tableRef}
          items={sortedItems}
          currentUser={currentUser}
          users={users}
          options={options}
          clients={clients}
          projects={projects}
          deliverables={deliverables}
          onUpdate={handleUpdate}
          onDelete={setDeleteTarget}
          onDuplicateRow={handleDuplicateRow}
          onFill={handleFill}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          onDateSort={handleDateSort}
          sortDirection={sortDirection}
          hiddenRows={hiddenRows}
          setHiddenRows={setHiddenRows}
          filters={filters}
          setFilters={setFilters}
          onAddRow={isAdmin ? undefined : handleAddRow}
          addingRow={addingRow}
          onSelectRange={handleSelectRange}
          sheetKey={activeSheet}
          onRequestHideRow={(rowId) => {
            const visibleIds = filteredItems.map((item) => item.id);

            const wouldHideEveryVisibleRow =
              visibleIds.length === 1 &&
              visibleIds[0] === rowId &&
              !hiddenRows.includes(rowId);

            if (wouldHideEveryVisibleRow) {
              setHideRowsErrorOpen(true);
              return;
            }

            setHiddenRows((current) =>
              current.includes(rowId)
                ? current
                : [...current, rowId]
            );

            if (selectedIds.includes(rowId)) {
              setSelectedIds((current) =>
                current.filter((id) => id !== rowId)
              );
            }
          }}
        />
      )}

      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => {
          if (!deleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={() => handleDelete(deleteTarget)}
        title="Delete this work entry?"
        description="This work entry will be permanently removed."
        warning="This action cannot be undone."
        confirmLabel="Delete Entry"
        loading={deleting}
      />

      <ConfirmDeleteModal
        open={bulkDeleteConfirmOpen}
        onClose={() => {
          if (!deleting) {
            setBulkDeleteConfirmOpen(false);
          }
        }}
        onConfirm={confirmBulkDelete}
        title={`Delete ${selectedIds.length} selected row${
          selectedIds.length === 1 ? "" : "s"
        }?`}
        description={`These ${selectedIds.length} selected work entr${
          selectedIds.length === 1 ? "y" : "ies"
        } will be permanently removed.`}
        warning="This action cannot be undone."
        confirmLabel="Delete Rows"
        loading={deleting}
      />

      {hideRowsErrorOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setHideRowsErrorOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hide-rows-error-title"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h2
                    id="hide-rows-error-title"
                    className="text-base font-semibold text-slate-900"
                  >
                    Can't hide every row
                  </h2>

                  <button
                    type="button"
                    onClick={() => setHideRowsErrorOpen(false)}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-2 text-sm leading-5 text-slate-600">
                  At least one row needs to stay visible on the sheet.
                  Unhide a row first if you want to hide this one.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                type="button"
                onClick={() => setHideRowsErrorOpen(false)}
              >
                OK
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}