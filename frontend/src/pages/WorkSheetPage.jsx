import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";
import { APP_ACTIONS, registerAppAction } from "@/lib/appActions";
import { downloadCsv } from "@/lib/exportCsv";
import { WorkSheetTabs } from "@/components/work-sheet/WorkSheetTabs";
import { ProjectsSheet, prefetchProjectSheet } from "@/components/work-sheet/ProjectsSheet";
import { SHEET_EXCLUDED_COLUMNS } from "@/components/work-sheet/WorkSheetTable";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useWorksheetUndo } from "@/hooks/useWorksheetUndo";
import { useWorksheetBulkActions } from "@/hooks/useWorksheetBulkActions";
import { useWorksheetRowCreation } from "@/hooks/useWorksheetRowCreation";
import { useWorksheetLookups } from "@/hooks/useWorksheetLookups";
import { useWorksheetItemsLoader } from "@/hooks/useWorksheetItemsLoader";
import { hasSessionState, useSessionState } from "@/hooks/useSessionState";
import { useWorksheetCollaborators } from "@/hooks/useWorksheetCollaborators";
import { useWorksheetDerived } from "@/hooks/useWorksheetDerived";
import { useWorksheetItemActions } from "@/hooks/useWorksheetItemActions";
import { WorksheetDialogs } from "@/components/work-sheet/page/WorksheetDialogs";
import { WorksheetGrid } from "@/components/work-sheet/page/WorksheetGrid";
import { WorksheetOverlays } from "@/components/work-sheet/page/WorksheetOverlays";
import { WorksheetToolbarArea } from "@/components/work-sheet/page/WorksheetToolbarArea";
import { toast } from "sonner";
import { WorkSheetSkeleton } from "@/components/skeletons/Skeletons";
import {
  DEPARTMENT_TO_STAGE,
  anyDialogOpen,
  buildWorksheetCsv,
  countActiveFilters,
  emptyFilters,
} from "@/lib/worksheetView";


export default function WorkSheetPage() {
  const { currentUser, currentUserId, users, loading: userLoading } = useUser();
  const location = useLocation();
  const navigate = useNavigate();
  const isPhone = useIsMobile();
  const [rawItems, setItems] = useState([]);

  // Content rows whose creator is missing or no longer matches a real user show
  // up as "Unassigned" and number in the thousands. The server already skips
  // them; this drops any that slip through (e.g. an older backend) BEFORE any
  // filtering, counting, grouping or rendering. Skipped until users have loaded
  // so the sheet can't briefly hide everything.
  const items = useMemo(() => {
    if (!users?.length) return rawItems;
    const known = new Set(users.map((u) => u.id));
    return rawItems.filter(
      (row) =>
        String(row.stage || "").trim().toLowerCase() !== "content" ||
        (row.creator_id && known.has(row.creator_id))
    );
  }, [rawItems, users]);

  // Admins open on "All"; everyone else opens on their own department's sheet
  // (Content -> Content, Design -> Design, Animation -> Animation). They can
  // still switch tabs.
  // Admins land on the Management sheet; everyone else on their team's sheet.
  const defaultSheetFor = (user) =>
    (user?.role === "admin" && "Projects") ||
    (user && DEPARTMENT_TO_STAGE[user.department]) ||
    "Master";
  // Remembered for the browser tab, so coming back from another page (or tab)
  // lands on the sheet the person was on.
  const [activeSheet, setActiveSheet] = useSessionState("worksheet-active-sheet", defaultSheetFor(currentUser));
  const defaultSheetApplied = useRef(Boolean(currentUser) || hasSessionState("worksheet-active-sheet"));
  useEffect(() => {
    // The user can arrive a moment after the page does.
    if (defaultSheetApplied.current || !currentUser) return;
    defaultSheetApplied.current = true;
    setActiveSheet(defaultSheetFor(currentUser));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);
  // Management sheet tasks, for its tab count (the sheet loads them itself).
  const [projectTasks, setProjectTasks] = useState(null);
  const { options, clients, projects, deliverables } = useWorksheetLookups({ currentUserId });

  // Filters are scoped to each worksheet tab so a filter applied on one
  // sheet does not leak into another sheet.
  const [filtersBySheet, setFiltersBySheet] = useSessionState("worksheet-filters", () => {
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

  // Grouping is scoped per-tab the same way filters are — switching from
  // Content to Design doesn't carry one tab's "Group: Member" choice
  // into the other. Session-only (not persisted), since this is a brand
  // new control with no prior behavior to preserve across reloads.
  const [groupByBySheet, setGroupByBySheet] = useSessionState("worksheet-group-by", {
    Master: "Member",
    Content: "Member",
    Design: "Member",
    Animation: "Member",
  });
  const groupBy = groupByBySheet[activeSheet] || "Member";
  const handleGroupByChange = useCallback(
    (value) => {
      setGroupByBySheet((current) => ({ ...current, [activeSheet]: value }));
    },
    [activeSheet]
  );

  // Mirrors whatever WorkSheetTable reports via onGroupCollapseStateChange
  // — only used to pick the toolbar button's label ("Collapse all" vs
  // "Expand all"); the collapsed set itself lives in the table.
  const [allGroupsCollapsed, setAllGroupsCollapsed] = useState(false);
  const handleToggleCollapseAll = useCallback(() => {
    if (allGroupsCollapsed) {
      tableRef.current?.expandAllGroups();
    } else {
      tableRef.current?.collapseAllGroups();
    }
  }, [allGroupsCollapsed]);

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

  // Month shown on the sheet ("YYYY-MM"; "" = every month). Opens on the
  // current month. Shared by all tabs, and kept out of `filters` so "Clear
  // filters" does not widen it. Uses the same UTC "today" as new rows, so a
  // row just added always lands in the month on screen.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useSessionState("worksheet-month", currentMonth);

  // Rows created (or arriving) outside the month on screen would vanish the
  // moment they appear; switch to the month they are in so they stay visible.
  const revealMonthOf = useCallback((created) => {
    const rows = Array.isArray(created) ? created : [created];
    const first = rows.find(Boolean);
    if (!first) return;
    const rowMonth = first.month || (first.work_date || "").slice(0, 7);
    if (!rowMonth) return;
    setMonth((current) => (current && current !== rowMonth ? rowMonth : current));
  }, []);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortDirection, setSortDirection] = useSessionState("worksheet-sort", "desc");
  const [loading, setLoading] = useState(true);
  // True while the full dataset is still loading in behind the fast
  // initial slice — lets the toolbar show a small "loading full list"
  // hint instead of silently having row counts change underneath you.
  const [loadingFullList, setLoadingFullList] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [hiddenRows, setHiddenRows] = useState(() => {
    try {
      const saved = localStorage.getItem("worksheet_hidden_rows");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [quickLoggerOpen, setQuickLoggerOpen] = useState(false);
  // Toolbar chip / ⌘K action: show only rows that still need a deliverable.
  const [onlyMissing, setOnlyMissing] = useSessionState("worksheet-only-missing", false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [hideRowsErrorOpen, setHideRowsErrorOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // ---- Undo (Ctrl/Cmd+Z) -----------------------------------------------------
  // Every change made on this sheet pushes an entry that knows how to reverse
  // it; Ctrl/Cmd+Z runs the latest. Typing in a text box keeps the browser's own
  // undo, so this only fires when focus is not in one.
  const updateRef = useRef(null);
  const {
    pushUndo,
    restoreRows,
    removeRows,
    revertFields,
    snapshotFields,
    runUndoRef,
  } = useWorksheetUndo({
    currentUser,
    itemsRef,
    setItems,
    setSelectedIds,
    revealMonthOf,
  });

  useEffect(() => {
    localStorage.setItem(
      "worksheet_hidden_rows",
      JSON.stringify(hiddenRows)
    );
  }, [hiddenRows]);

  const { fetchItems } = useWorksheetItemsLoader({
    currentUser,
    setItems,
    setLoading,
    setLoadingFullList,
  });

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
    if (location.state?.newWorkItem) {
      // The created row travels with us via router state now, so it can be
      // spliced straight into the local list — no need to re-download the
      // whole (potentially thousands-of-rows) collection just to show it.
      setItems((prev) => [location.state.newWorkItem, ...prev]);
      revealMonthOf(location.state.newWorkItem);
      navigate(location.pathname, { replace: true, state: {} });
    } else if (location.state?.refreshWorkSheet) {
      // Fallback for a NotificationCenter build that only sends the old
      // boolean flag (no item payload) — still correct, just heavier.
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
  }, [filters, activeSheet, onlyMissing, month]);

  // All filtering (search, date range, project/deliverable/type/category,
  // creator, reviewer, status) plus the per-tab stage scoping happens here,
  // client-side, against the single fetched copy of `items` — this is what
  // makes applying a filter instant rather than waiting on a server round
  // trip.
  // Lookup maps for the search box, which now also matches on client and
  // project name (not just deliverable name / remarks). Kept as maps
  // rather than clients.find()/projects.find() per item so filtering
  // thousands of rows on every keystroke stays O(n) instead of O(n*m).
  const {
    clientNameById,
    userNameById,
    projectById,
    searchPending,
    filteredItems,
    missingDeliverableCount,
    tabCounts,
    sortedItems,
  } = useWorksheetDerived({ items, clients, users, projects, options, filters, loadingFullList, month, activeSheet, onlyMissing, projectTasks, sortDirection });

  // Export the rows currently shown on this sheet (tab, month, search and
  // every filter applied, newest first) as a CSV.
  const handleExport = () => {
    if (sortedItems.length === 0) {
      toast.info("No rows to export");
      return;
    }
    const { filename, header, rows } = buildWorksheetCsv({
      sortedItems,
      activeSheet,
      excludedColumns: SHEET_EXCLUDED_COLUMNS[activeSheet],
      month,
      projectById,
      clientNameById,
      userNameById,
    });
    downloadCsv(filename, header, rows);
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  };

  const activeFilterCount = countActiveFilters(filters);

  const {
    addingRow,
    bulkAdding,
    handleAddRow,
    handleQuickLoggerSave,
    handleBulkAddRows,
    handleInsertRow,
    handleDuplicateRow,
    handleBulkDuplicate,
  } = useWorksheetRowCreation({
    currentUser,
    activeSheet,
    canAddToActiveSheet,
    selectedIds,
    setSelectedIds,
    setItems,
    itemsRef,
    sortedItems,
    tableRef,
    revealMonthOf,
    pushUndo,
    removeRows,
  });

  const {
    handleUpdate,
    handleDelete,
    handleFill,
  } = useWorksheetItemActions({ currentUser, options, itemsRef, setItems, pushUndo, restoreRows, revertFields, runUndoRef, updateRef, setDeleting, setDeleteTarget });

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

  // ---- Collaborators ---------------------------------------------------------
  // Every creator on each shared entry, across ALL rows (not just the ones the
  // filters show), so the picker can mark who is already on it.
  const { collabIndex, bulkCollabPeople, handleAddCollaborators } =
    useWorksheetCollaborators({
      currentUser,
      items,
      users,
      selectedIds,
      setItems,
      setSelectedIds,
    });

  const { handleBulkStatus, handleBulkAssign, handleBulkDelete, confirmBulkDelete } =
    useWorksheetBulkActions({
      currentUser,
      activeSheet,
      selectedIds,
      setSelectedIds,
      setItems,
      itemsRef,
      pushUndo,
      revertFields,
      restoreRows,
      snapshotFields,
      setBulkDeleteConfirmOpen,
      setDeleting,
    });


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
        anyDialogOpen() ||
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
    historyOpen,
    deleteTarget,
    bulkDeleteConfirmOpen,
  ]);

  // Things the ⌘K palette (and the sidebar's pinned projects) ask this page
  // to do. Refs keep the registered handlers pointing at the latest state.
  const addRowActionRef = useRef(null);
  addRowActionRef.current = () => {
    if (loading) {
      // Data still arriving (we just navigated here): try again shortly.
      window.setTimeout(() => addRowActionRef.current?.(), 300);
      return;
    }
    handleAddRow();
  };

  useEffect(() => {
    const unsubscribers = [
      registerAppAction(APP_ACTIONS.QUICK_LOG, () => {
        if (isManager || isMember) setQuickLoggerOpen(true);
      }),
      registerAppAction(APP_ACTIONS.ADD_ROW, () => {
        if (isManager || isMember) addRowActionRef.current?.();
      }),
      registerAppAction(APP_ACTIONS.SHOW_MISSING, () => {
        setActiveSheet("Master");
        setOnlyMissing(true);
      }),
    ];

    return () => unsubscribers.forEach((off) => off());
  }, [isManager, isMember]);

  // Arriving from the palette or a pinned project with a search to apply.
  useEffect(() => {
    const incoming = location.state?.search;
    if (typeof incoming === "string") {
      setActiveSheet("Master");
      setOnlyMissing(false);
      // A project's rows span months, so search across all of them.
      setMonth("");
      setFiltersBySheet((current) => ({
        ...current,
        Master: {
          ...emptyFilters,
          project_ids: [],
          deliverable_ids: [],
          stages: [],
          deliverable_types: [],
          work_categories: [],
          creator_ids: [],
          reviewer_ids: [],
          statuses: [],
          search: incoming,
        },
      }));
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.key]);

  // Global "L" shortcut — opens the Quick Logger from anywhere on the
  // page, matching the floating trigger button's own hint. Same
  // editable-field guard as the Delete/Backspace shortcut above (typing
  // the letter L into a cell or input must never trigger this), plus a
  // check that no other overlay is already open.
  useEffect(() => {
    if (!(isManager || isMember)) return undefined;

    const isEditableTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (el.isContentEditable) return true;
      const role = el.getAttribute?.("role");
      if (role === "combobox" || role === "textbox") return true;
      return false;
    };

    const handleQuickLoggerShortcut = (event) => {
      if (event.key !== "l" && event.key !== "L") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (
        quickLoggerOpen ||
        anyDialogOpen() ||
        historyOpen ||
        deleteTarget ||
        bulkDeleteConfirmOpen
      ) {
        return;
      }

      event.preventDefault();
      setQuickLoggerOpen(true);
    };

    document.addEventListener("keydown", handleQuickLoggerShortcut);
    return () =>
      document.removeEventListener("keydown", handleQuickLoggerShortcut);
  }, [
    isManager,
    isMember,
    quickLoggerOpen,
    historyOpen,
    deleteTarget,
    bulkDeleteConfirmOpen,
  ]);

  // Start loading the Management tab now so it opens instantly later.
  useEffect(() => {
    prefetchProjectSheet()
      .then((cache) => setProjectTasks(cache.data))
      .catch(() => {});
  }, []);

  if (userLoading || !currentUser) {
    return <WorkSheetSkeleton />;
  }

  // The Management tab (key "Projects") is a different sheet - its own rows
  // and columns, not work items - so it replaces everything below the tabs.
  if (activeSheet === "Projects") {
    return (
      <ProjectsSheet
        currentUser={currentUser}
        users={users}
        clients={clients}
        tabs={<WorkSheetTabs activeSheet={activeSheet} onChange={setActiveSheet} counts={tabCounts} />}
      />
    );
  }


  const ctx = {
    activeFilterCount,
    activeSheet,
    addingRow,
    allGroupsCollapsed,
    bulkAdding,
    bulkCollabPeople,
    bulkDeleteConfirmOpen,
    canAddToActiveSheet,
    clients,
    collabIndex,
    confirmBulkDelete,
    currentMonth,
    currentUser,
    deleteTarget,
    deleting,
    deliverables,
    filteredItems,
    filters,
    filtersOpen,
    groupBy,
    handleAddCollaborators,
    handleAddRow,
    handleBulkAddRows,
    handleBulkAssign,
    handleBulkDelete,
    handleBulkDuplicate,
    handleBulkStatus,
    handleDateSort,
    handleDelete,
    handleDuplicateRow,
    handleExport,
    handleFill,
    handleGroupByChange,
    handleHideRows,
    handleInsertRow,
    handleQuickLoggerSave,
    handleSelectRange,
    handleToggleCollapseAll,
    handleUpdate,
    hiddenRows,
    hideRowsErrorOpen,
    historyOpen,
    isAdmin,
    isManager,
    isMember,
    isPhone,
    items,
    loading,
    loadingFullList,
    missingDeliverableCount,
    month,
    onlyMissing,
    options,
    projects,
    pushUndo,
    quickLoggerOpen,
    searchPending,
    selectedIds,
    setActiveSheet,
    setAllGroupsCollapsed,
    setBulkDeleteConfirmOpen,
    setDeleteTarget,
    setFilters,
    setFiltersOpen,
    setHiddenRows,
    setHideRowsErrorOpen,
    setHistoryOpen,
    setMonth,
    setOnlyMissing,
    setQuickLoggerOpen,
    setSelectedIds,
    sortDirection,
    sortedItems,
    tabCounts,
    tableRef,
    toggleSelect,
    toggleSelectAll,
    users,
  };
  return (
    <div className="flex h-full flex-col bg-background">
      <WorksheetToolbarArea {...ctx} />

      <WorksheetOverlays {...ctx} />

      <WorksheetGrid {...ctx} />

      <WorksheetDialogs {...ctx} />
    </div>
  );
}