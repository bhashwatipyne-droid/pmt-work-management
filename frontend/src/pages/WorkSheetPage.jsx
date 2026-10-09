import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";
import { APP_ACTIONS, registerAppAction } from "@/lib/appActions";
import { refreshCounts } from "@/lib/countsBus";
import { downloadCsv, slugify, todayStamp } from "@/lib/exportCsv";
import { consumePrefetch, WORKSHEET_INITIAL_ROW_LIMIT } from "@/services/prefetch";
import {
  addWorkItemCollaborators,
  bulkDeleteWorkItems,
  bulkUpdateWorkItems,
  bulkCreateWorkItems,
  createWorkItem,
  deleteWorkItem,
  getOptions,
  getWorkItems,
  updateWorkItem,
  getWorksheetLookups,
  getClients,
  getProjects,
  getDeliverables,
} from "@/services/api";
import { WorkSheetToolbar } from "@/components/work-sheet/WorkSheetToolbar";
import { WorkSheetTabs } from "@/components/work-sheet/WorkSheetTabs";
import { WorkSheetTable, SHEET_EXCLUDED_COLUMNS } from "@/components/work-sheet/WorkSheetTable";
import { WorksheetFilterPanel } from "@/components/work-sheet/WorksheetFilterPanel";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { BulkActionBar } from "@/components/work-sheet/BulkActionBar";
import { MobileWorkList } from "@/components/work-sheet/MobileWorkList";
import { useIsMobile } from "@/hooks/useIsMobile";
// Lazy — both are closed by default (~1,500 lines combined), so their
// code only needs to download once someone actually opens one, instead
// of padding out the Work Sheet page's own initial chunk.
const QuickLoggerModal = lazy(() => import("../components/work-sheet/QuickLoggerModal"));
import { QuickLogTrigger } from "../components/work-sheet/QuickLogTrigger";
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
  matchesDeliverableFilter,
  matchesProjectFilter,
  matchesReviewerFilter,
} from "@/lib/worksheetFilterOptions";
import { durationSecondsOf } from "@/lib/quantity";
import {
  TIME_GATED_STATUSES,
  TIME_REQUIRED_MESSAGE,
  hasTime,
  parseTimeInput,
} from "@/lib/timeRules";
import { WorkSheetSkeleton, WorkSheetTableSkeleton } from "@/components/skeletons/Skeletons";

// Any dialog on screen (Bulk review now lives in the top bar, outside this
// page, so the page can't track it with its own state any more). Used to keep
// Delete / "L" from acting on the sheet underneath an open dialog.
const anyDialogOpen = () =>
  Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));

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
  const defaultSheetFor = (user) =>
    (user && user.role !== "admin" && DEPARTMENT_TO_STAGE[user.department]) ||
    "Master";
  const [activeSheet, setActiveSheet] = useState(() => defaultSheetFor(currentUser));
  const defaultSheetApplied = useRef(Boolean(currentUser));
  useEffect(() => {
    // The user can arrive a moment after the page does.
    if (defaultSheetApplied.current || !currentUser) return;
    defaultSheetApplied.current = true;
    setActiveSheet(defaultSheetFor(currentUser));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);
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

  // Grouping is scoped per-tab the same way filters are — switching from
  // Content to Design doesn't carry one tab's "Group: Member" choice
  // into the other. Session-only (not persisted), since this is a brand
  // new control with no prior behavior to preserve across reloads.
  const [groupByBySheet, setGroupByBySheet] = useState({
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
  const [month, setMonth] = useState(currentMonth);

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
  const [sortDirection, setSortDirection] = useState("desc");
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
  const [bulkAdding, setBulkAdding] = useState(false);
  const [addingRow, setAddingRow] = useState(false);
  const [quickLoggerOpen, setQuickLoggerOpen] = useState(false);
  // Toolbar chip / ⌘K action: show only rows that still need a deliverable.
  const [onlyMissing, setOnlyMissing] = useState(false);
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

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // ---- Undo (Ctrl/Cmd+Z) -----------------------------------------------------
  // Every change made on this sheet pushes an entry that knows how to reverse
  // it; Ctrl/Cmd+Z runs the latest. Typing in a text box keeps the browser's own
  // undo, so this only fires when focus is not in one.
  const undoStackRef = useRef([]);
  const undoBusyRef = useRef(false);
  const updateRef = useRef(null);

  const pushUndo = useCallback((label, undo) => {
    undoStackRef.current.push({ label, undo });
    if (undoStackRef.current.length > 50) undoStackRef.current.shift();
  }, []);

  // Rows deleted by an undo of "add", or by the user, come back as new rows
  // (same content, new id).
  const restoreRows = async (rows) => {
    const created = await Promise.all(
      rows.map((r) =>
        createWorkItem(currentUser.id, {
          work_date: r.work_date,
          deliverable_name: r.deliverable_name || "",
          deliverable_type: r.deliverable_type || "",
          deliverable_link: r.deliverable_link || "",
          work_category: r.work_category || "",
          version: r.version || "",
          time_taken_minutes: r.time_taken_minutes || 0,
          quantity: r.quantity ?? 1.0,
          quantity_items: r.quantity_items?.length ? r.quantity_items : null,
          video_duration_seconds: r.video_duration_seconds ?? null,
          video_duration_minutes: r.video_duration_minutes ?? null,
          creator_id: r.creator_id || null,
          reviewer_id: r.reviewer_id || null,
          manager_id: r.manager_id || null,
          client_id: r.client_id || null,
          project_id: r.project_id || null,
          deliverable_id: r.deliverable_id || null,
          deliverable_not_available: Boolean(r.deliverable_not_available),
          stage: r.stage || null,
          remarks: r.remarks || "",
          status: r.status || "Not Started",
        })
      )
    );
    setItems((prev) => [...created, ...prev]);
    revealMonthOf(created);
    refreshCounts();
  };

  const removeRows = async (ids) => {
    await bulkDeleteWorkItems(currentUser.id, ids);
    const gone = new Set(ids);
    setItems((prev) => prev.filter((row) => !gone.has(row.id)));
    setSelectedIds((prev) => prev.filter((id) => !gone.has(id)));
    refreshCounts();
  };

  // Put field values back: `entries` = [{ id, values: { field: oldValue } }].
  // Rows that had the same old values go back in one request.
  const revertFields = async (entries) => {
    const groups = new Map();
    entries.forEach(({ id, values }) => {
      const key = JSON.stringify(values);
      if (!groups.has(key)) groups.set(key, { values, ids: [] });
      groups.get(key).ids.push(id);
    });

    for (const { values, ids } of groups.values()) {
      const updated = await bulkUpdateWorkItems(currentUser.id, ids, values);
      const byId = Object.fromEntries(updated.map((u) => [u.id, u]));
      setItems((prev) => prev.map((it) => byId[it.id] || it));
    }
    refreshCounts();
  };

  const snapshotFields = (ids, keys) =>
    itemsRef.current
      .filter((it) => ids.includes(it.id))
      .map((it) => ({
        id: it.id,
        values: Object.fromEntries(
          keys.map((k) => [k, it[k] ?? (typeof it[k] === "string" ? "" : null)])
        ),
      }));

  const runUndo = async () => {
    if (undoBusyRef.current) return;
    const entry = undoStackRef.current.pop();
    if (!entry) {
      toast("Nothing to undo");
      return;
    }

    undoBusyRef.current = true;
    try {
      await entry.undo();
      toast.success(`Undid: ${entry.label}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || `Could not undo: ${entry.label}`);
    } finally {
      undoBusyRef.current = false;
    }
  };
  const runUndoRef = useRef(runUndo);
  runUndoRef.current = runUndo;

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (String(event.key).toLowerCase() !== "z") return;

      const el = event.target;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable ||
        el?.getAttribute?.("role") === "combobox"
      ) {
        return; // the text box's own undo
      }
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

      event.preventDefault();
      runUndoRef.current();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "worksheet_hidden_rows",
      JSON.stringify(hiddenRows)
    );
  }, [hiddenRows]);

  useEffect(() => { getOptions().then(setOptions); }, []);

  useEffect(() => {
    if (!currentUserId) return;
    // One slim request (id/name/client only) instead of three full ones -
    // /projects used to bring every deliverable nested inside every project
    // and /deliverables then sent the same deliverables again. Already
    // started at boot when this is the landing page (see services/prefetch).
    // The fallback keeps the sheet working if the frontend is deployed before
    // the backend that has /worksheet/lookups.
    consumePrefetch("worksheet-lookups", getWorksheetLookups)
      .catch(() =>
        Promise.all([
          getClients(),
          getProjects(currentUserId, { include_deliverables: false }),
          getDeliverables(currentUserId),
        ]).then(([clients, projects, deliverables]) => ({ clients, projects, deliverables }))
      )
      .then(({ clients: c, projects: p, deliverables: d }) => {
        setClients(c || []);
        setProjects(p || []);
        setDeliverables(d || []);
      })
      .catch(() => {});
  }, [currentUserId]);

  // How many rows to ask for in the fast initial slice — small enough to
  // paint quickly even with thousands of total rows, large enough that
  // most people won't notice the list is still partial for the second
  // or so before the full set lands.
  const INITIAL_ROW_LIMIT = WORKSHEET_INITIAL_ROW_LIMIT;
  const hasLoadedFullListRef = useRef(false);

  const fetchItems = (showLoading = true) => {
    if (!currentUser) return;
    if (showLoading) {
      setLoading(true);
    }

    // Only the very first load (not a refresh after an edit, not the
    // periodic background sync) gets the two-phase treatment — those
    // other callers want the accurate full set directly, not a partial
    // slice.
    if (showLoading && !hasLoadedFullListRef.current) {
      setLoadingFullList(true);

      // Already in flight from boot when this is the landing page.
      let gotEverything = false;

      consumePrefetch("worksheet-items-initial", () =>
        getWorkItems(currentUser.id, { limit: INITIAL_ROW_LIMIT, hide_unassigned_content: true })
      )
        .then((data) => {
          const rows = Array.isArray(data) ? data : [];
          setItems(rows);
          // Fewer rows than we asked for means that WAS the whole list, so
          // the second, unbounded request below would only re-download and
          // re-validate the same rows.
          gotEverything = rows.length < INITIAL_ROW_LIMIT;
        })
        .catch(() => {
          // Swallowed — the full fetch below still runs and its own
          // catch surfaces a toast if that fails too.
        })
        .finally(() => {
          setLoading(false);

          if (gotEverything) {
            hasLoadedFullListRef.current = true;
            setLoadingFullList(false);
            return;
          }

          getWorkItems(currentUser.id, { hide_unassigned_content: true })
            .then((data) => {
              setItems(Array.isArray(data) ? data : []);
              hasLoadedFullListRef.current = true;
            })
            .catch(() => toast.error("Could not load work items"))
            .finally(() => setLoadingFullList(false));
        });

      return;
    }

    // Fetches the whole dataset, unfiltered. Every filter and tab switch
    // below is applied client-side against this single copy — no network
    // round-trip per filter change, so it's instant instead of waiting
    // on a request each time (and immune to a slow/sleeping backend
    // instance).
    getWorkItems(currentUser.id, { hide_unassigned_content: true })
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        hasLoadedFullListRef.current = true;
      })
      .catch(() => toast.error("Could not load work items"))
      .finally(() => {
        if (showLoading) {
          setLoading(false);
        }
      });
  };

  useEffect(() => {
    hasLoadedFullListRef.current = false;
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
  const clientNameById = useMemo(() => {
    const map = new Map();
    clients.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clients]);

  const userNameById = useMemo(() => {
    const map = new Map();
    (users || []).forEach((u) => map.set(u.id, u.name || ""));
    return map;
  }, [users]);

  const projectById = useMemo(() => {
    const map = new Map();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  const filteredItems = useMemo(() => {
    const sheetStage =
      activeSheet === "Master"
        ? null
        : (DEPARTMENT_TO_STAGE[activeSheet] || activeSheet).trim().toLowerCase();

    const selectedStages =
      activeSheet === "Master" && filters.stages?.length
        ? new Set(filters.stages.map((s) => String(s).trim().toLowerCase()))
        : null;

    // Every word has to match somewhere in the row, in any order, so
    // "icici contra carousel" finds a carousel in ICICI's Contra Fund
    // project even though those words sit in different columns.
    const searchTerms = (filters.search || "")
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const search = searchTerms.length > 0;
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
        // Same fallback WorkSheetRow uses to resolve a row's client: the
        // row's own client_id, or failing that, its project's client_id.
        const project = projectById.get(item.project_id);
        const effectiveClientId = item.client_id || project?.client_id;
        const clientName = effectiveClientId
          ? clientNameById.get(effectiveClientId) || ""
          : "";
        const projectName = project?.name || "";

        const owner = userNameById.get(item.creator_id) || "";

        const haystack = `${item.deliverable_name || ""} ${item.remarks || ""} ${clientName} ${projectName} ${item.deliverable_type || ""} ${owner}`.toLowerCase();
        if (!searchTerms.every((term) => haystack.includes(term))) return false;
      }

      if (
        onlyMissing &&
        !isDeliverableMissing(item, options.deliverable_type_categories)
      ) {
        return false;
      }

      if (filters.date_from && (item.work_date || "") < filters.date_from) return false;
      if (filters.date_to && (item.work_date || "") > filters.date_to) return false;
      if (filters.month && item.month !== filters.month) return false;
      if (month && (item.month || (item.work_date || "").slice(0, 7)) !== month) return false;

      if (projectIds && !matchesProjectFilter(item, projectIds)) return false;
      if (deliverableIds && !matchesDeliverableFilter(item, deliverableIds)) return false;
      if (deliverableTypes && !deliverableTypes.has(item.deliverable_type)) return false;
      if (workCategories && !workCategories.has(item.work_category)) return false;
      if (creatorIds && !creatorIds.has(item.creator_id)) return false;
      if (reviewerIds && !matchesReviewerFilter(item, reviewerIds)) return false;
      if (statuses && !statuses.has(item.status)) return false;

      return true;
    });
  }, [
    items,
    filters,
    month,
    activeSheet,
    clientNameById,
    projectById,
    userNameById,
    onlyMissing,
    options.deliverable_type_categories,
  ]);

  // Toolbar's "N missing a deliverable" badge — purely informational, so
  // scoped the same as the visible row count (post search/filter) rather
  // than some separate, harder-to-explain total.
  const missingDeliverableCount = useMemo(
    () =>
      filteredItems.filter((item) =>
        isDeliverableMissing(item, options.deliverable_type_categories)
      ).length,
    [filteredItems, options.deliverable_type_categories]
  );

  // Per-tab counts shown next to each tab label (e.g. "Content 7") —
  // scoped to the tab's own stage and to the month on screen (same rule the
  // row filter uses), independent of any active search/filter, so switching
  // filters doesn't make the tabs themselves jump around. With "every month"
  // selected (month = "") this is the all-time total.
  const tabCounts = useMemo(() => {
    const counts = { Master: 0, Content: 0, Design: 0, Animate: 0 };

    items.forEach((item) => {
      if (
        month &&
        (item.month || (item.work_date || "").slice(0, 7)) !== month
      ) {
        return;
      }
      counts.Master += 1;
      const stage = String(item.stage || "").trim();
      if (stage === "Content") counts.Content += 1;
      else if (stage === "Design") counts.Design += 1;
      else if (stage === "Animate") counts.Animate += 1;
    });

    return counts;
  }, [items, month]);

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

  // Export the rows currently shown on this sheet (tab, month, search and
  // every filter applied, newest first) as a CSV.
  const handleExport = () => {
    if (sortedItems.length === 0) {
      toast.info("No rows to export");
      return;
    }
    const allColumns = [
      "Date", "Client", "Project", "Stage", "Deliverable", "Type", "Qty",
      "Duration", "Category", "Version", "Time (min)", "Creator",
      "Reviewer", "Status", "Remarks", "Link",
    ];
    // Same columns as the tab on screen (Qty / Duration are left out of the
    // sheets that don't use them).
    const excluded = SHEET_EXCLUDED_COLUMNS[activeSheet] || [];
    const keep = allColumns.map((name) => !excluded.includes(name));
    // Duration is exported as plain seconds.
    const header = allColumns
      .filter((_, i) => keep[i])
      .map((name) => (name === "Duration" ? "Duration (sec)" : name));
    const rows = sortedItems.map((item) => {
      const project = projectById.get(item.project_id);
      const clientId = item.client_id || project?.client_id;
      return [
        item.work_date || "",
        (clientId && clientNameById.get(clientId)) || "",
        project?.name || "",
        item.stage || "",
        item.deliverable_name || "",
        item.deliverable_type || "",
        item.quantity > 1 ? item.quantity : "",
        durationSecondsOf(item) ?? "",
        item.work_category || "",
        item.version || "",
        item.time_taken_minutes ?? "",
        userNameById.get(item.creator_id) || "",
        userNameById.get(item.reviewer_id) || "",
        item.status || "",
        item.remarks || "",
        item.deliverable_link || "",
      ].filter((_, i) => keep[i]);
    });
    const name = [
      "worksheet",
      slugify(activeSheet),
      month || "all-months",
      todayStamp(),
    ].join("-");
    downloadCsv(`${name}.csv`, header, rows);
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  };

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
      revealMonthOf(created);
      pushUndo("added row", () => removeRows([created.id]));

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
    const created = [];

    for (const payload of payloads) {
      const item = await createWorkItem(currentUser.id, payload);
      created.push(item);

      trackEvent("task_created", {
        task_id: item.id,
      });
    }

    // Previously this called fetchItems(), which — once the full list has
    // loaded once — always re-downloads the ENTIRE work-items collection
    // (up to 5000 rows) from Mongo just to show the handful of rows that
    // were just created. Every other create/edit path in this file already
    // updates `items` locally (see handleAddRow etc.) — do the same here.
    setItems((prev) => [...created, ...prev]);
    revealMonthOf(created);
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
      revealMonthOf(created);
      pushUndo(`added ${created.length} rows`, () => removeRows(created.map((r) => r.id)));

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
  const handleUpdate = useCallback(async (id, patch, opts = {}) => {
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

      if (!opts.skipUndo && previous) {
        const keys = Object.keys(patch);
        const changed = keys.some(
          (k) => String(previous[k] ?? "") !== String(patch[k] ?? "")
        );
        if (changed) {
          const back = Object.fromEntries(
            keys.map((k) => [
              k,
              previous[k] ?? (typeof patch[k] === "string" ? "" : null),
            ])
          );
          pushUndo("cell edit", async () => {
            const result = await updateRef.current(id, back, { skipUndo: true });
            if (!result?.success) throw new Error("update failed");
          });
        }
      }

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
  updateRef.current = handleUpdate;

  const handleDelete = async (item) => {
    if (!item?.id) return;

    setDeleting(true);

    try {
      await deleteWorkItem(currentUser.id, item.id);

      setItems((prev) => prev.filter((row) => row.id !== item.id));

      pushUndo("deleted entry", () => restoreRows([item]));
      toast.success("Entry deleted", {
        action: { label: "Undo", onClick: () => runUndoRef.current() },
      });
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

      const changedBack = previous
        .filter((entry) => updatedById[entry.id])
        .map((entry) => ({
          id: entry.id,
          values: { [field]: entry.value ?? (typeof value === "string" ? "" : null) },
        }));
      if (changedBack.length) {
        pushUndo(`fill of ${changedBack.length} cell${changedBack.length === 1 ? "" : "s"}`, () =>
          revertFields(changedBack)
        );
      }
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
      revealMonthOf(created);
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
      pushUndo("duplicated row", () => removeRows([created.id]));
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

  // New — the redesigned bulk action bar adds a "Duplicate" action for
  // the current selection. There was no bulk-duplicate endpoint before,
  // so this fires the same per-item creation handleDuplicateRow uses,
  // once per selected row, then does a single combined toast/refresh
  // instead of one per row.
  const handleBulkDuplicate = async () => {
    const targets = itemsRef.current.filter((item) =>
      selectedIds.includes(item.id)
    );

    if (!targets.length) return;

    try {
      const created = await Promise.all(
        targets.map((item) =>
          createWorkItem(currentUser.id, {
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
          })
        )
      );

      setItems((prev) => [...created, ...prev]);
      revealMonthOf(created);
      pushUndo(`duplicated ${created.length} row${created.length === 1 ? "" : "s"}`, () =>
        removeRows(created.map((r) => r.id))
      );
      tableRef.current?.resetColumnSort();
      tableRef.current?.scrollToTop();
      setSelectedIds([]);

      trackEvent("row_added", {
        worksheet: activeSheet,
        count: created.length,
        bulk: true,
        duplicated: true,
      });

      toast.success(
        `${created.length} row${created.length === 1 ? "" : "s"} duplicated`
      );
      refreshCounts();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not duplicate rows");
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
    const ids = [...selectedIds];
    const idSet = new Set(ids);
    const before = new Map(
      itemsRef.current.filter((it) => idSet.has(it.id)).map((it) => [it.id, it])
    );

    // Show the new status straight away instead of after the round trip; the
    // server's answer below replaces it, and any row it refused (or the whole
    // batch, if the request fails) goes back to what it was.
    setItems((prev) =>
      prev.map((it) => (idSet.has(it.id) ? { ...it, status } : it))
    );
    setSelectedIds([]);

    try {
      const updated = await bulkUpdateWorkItems(currentUser.id, ids, { status });
      const byId = Object.fromEntries(updated.map((u) => [u.id, u]));
      setItems((prev) =>
        prev.map((it) => {
          if (byId[it.id]) return byId[it.id];
          return before.has(it.id) ? before.get(it.id) : it;
        })
      );
      const skipped = ids.length - updated.length;
      const statusBefore = [...before.values()]
        .filter((it) => byId[it.id])
        .map((it) => ({ id: it.id, values: { status: it.status } }));
      if (statusBefore.length) {
        pushUndo(`status change on ${statusBefore.length} row${statusBefore.length === 1 ? "" : "s"}`, () =>
          revertFields(statusBefore)
        );
      }
      toast.success(
        `Updated ${updated.length} row${updated.length === 1 ? "" : "s"}` +
          (skipped > 0 ? ` (${skipped} could not be changed)` : "")
      );
      refreshCounts();
    } catch (e) {
      setItems((prev) => prev.map((it) => before.get(it.id) || it));
      toast.error(e.response?.data?.detail || "Bulk update failed");
    }
  };

  // ---- Collaborators ---------------------------------------------------------
  // Every creator on each shared entry, across ALL rows (not just the ones the
  // filters show), so the picker can mark who is already on it.
  const collabIndex = useMemo(() => {
    const groups = new Map();
    for (const row of items) {
      if (!row.collab_group_id) continue;
      const list = groups.get(row.collab_group_id);
      if (list) list.push(row.creator_id);
      else groups.set(row.collab_group_id, [row.creator_id]);
    }
    return groups;
  }, [items]);

  // Who can be tagged from the bulk bar: people whose team works the selected
  // rows' stage(s). The server re-checks every pair and says why it skipped one.
  const bulkCollabPeople = useMemo(() => {
    if (!selectedIds.length) return [];
    const picked = new Set(selectedIds);
    const stages = new Set(
      items.filter((row) => picked.has(row.id)).map((row) => row.stage || "")
    );
    return (users || [])
      .filter(
        (u) =>
          u.role !== "admin" &&
          u.role !== "hr" &&
          u.active !== false &&
          (stages.has("") || stages.has(DEPARTMENT_TO_STAGE[u.department]))
      )
      .map((u) => ({ id: u.id, name: u.name, department: u.department }));
  }, [selectedIds, items, users]);

  const COLLAB_REASONS = {
    owner: "Owns this entry already",
    already_has_entry: "Already has this entry",
    different_stage: "Works in another team",
    not_available: "Not available",
  };

  // Tag people on one or more entries. Each person gets their own row; anyone
  // who already has the entry is skipped by the server, so repeating this adds
  // nothing. Returns { problems } for the picker to show inline.
  const handleAddCollaborators = useCallback(
    async (rowIds, creatorIds) => {
      let result;
      try {
        result = await addWorkItemCollaborators(currentUser.id, rowIds, creatorIds);
      } catch (e) {
        throw new Error(e.response?.data?.detail || "Could not add collaborators. Try again.");
      }

      const created = result.created || [];
      const sourceById = Object.fromEntries((result.updated_sources || []).map((r) => [r.id, r]));
      if (created.length || Object.keys(sourceById).length) {
        setItems((prev) => {
          const have = new Set(prev.map((r) => r.id));
          return [
            ...created.filter((r) => !have.has(r.id)),
            ...prev.map((r) => sourceById[r.id] || r),
          ];
        });
        refreshCounts();
      }

      const makers = new Set(created.map((r) => r.creator_id));
      const problems = [];

      // Whole-entry refusals (not yours, still blank, ...), once each.
      const rowReasons = new Map();
      (result.row_errors || []).forEach((e) =>
        rowReasons.set(e.reason, (rowReasons.get(e.reason) || 0) + 1)
      );
      rowReasons.forEach((count, reason) =>
        problems.push({
          text: rowIds.length > 1 ? `${count} ${count === 1 ? "entry" : "entries"}: ${reason}` : reason,
        })
      );

      // People who got nothing, with the reason.
      const reasonsByPerson = new Map();
      (result.skipped || []).forEach((sk) => {
        if (makers.has(sk.creator_id)) return;
        reasonsByPerson.set(sk.creator_id, COLLAB_REASONS[sk.reason] || sk.reason);
      });
      reasonsByPerson.forEach((text, id) => problems.push({ id, text }));

      const people = makers.size;
      if (created.length) {
        const skippedCount = (result.skipped || []).length;
        toast.success(
          `Added ${people} ${people === 1 ? "person" : "people"} (${created.length} new ${created.length === 1 ? "row" : "rows"})` +
            (skippedCount ? ` · ${skippedCount} skipped` : "")
        );
      }
      // Keep the selection (and the picker's inline notes) while anything was refused.
      if (rowIds.length > 1 && created.length && !problems.length) setSelectedIds([]);
      return { problems };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser]
  );

  const handleBulkAssign = async (patch) => {
    try {
      const assignBefore = snapshotFields(selectedIds, Object.keys(patch));
      const updated = await bulkUpdateWorkItems(currentUser.id, selectedIds, patch);
      const byId = Object.fromEntries(updated.map((u) => [u.id, u]));
      setItems((prev) => prev.map((it) => byId[it.id] || it));
      const assignedBack = assignBefore.filter((entry) => byId[entry.id]);
      if (assignedBack.length) {
        pushUndo(`assign on ${assignedBack.length} row${assignedBack.length === 1 ? "" : "s"}`, () =>
          revertFields(assignedBack)
        );
      }
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

      const deletedItems = itemsRef.current.filter((item) =>
        idsToDelete.includes(item.id)
      );

      setItems((prev) =>
        prev.filter((item) => !idsToDelete.includes(item.id))
      );

      if (deletedItems.length) {
        pushUndo(
          `deleted ${deletedItems.length} row${deletedItems.length === 1 ? "" : "s"}`,
          () => restoreRows(deletedItems)
        );
      }

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
        totalCount={tabCounts[activeSheet] ?? items.length}
        missingDeliverableCount={missingDeliverableCount}
        onlyMissing={onlyMissing}
        onToggleMissing={() => setOnlyMissing((current) => !current)}
        loadingFullList={loadingFullList}
        groupBy={groupBy}
        onGroupByChange={handleGroupByChange}
        allCollapsed={allGroupsCollapsed}
        onToggleCollapseAll={handleToggleCollapseAll}
        onExport={handleExport}
        tabs={
          <WorkSheetTabs
            activeSheet={activeSheet}
            onChange={setActiveSheet}
            counts={tabCounts}
          />
        }
        onBulkAdd={isAdmin ? undefined : handleBulkAddRows}
        bulkAdding={bulkAdding}
        onOpenHistory={() => setHistoryOpen(true)}
        month={month}
        onMonthChange={setMonth}
        currentMonth={currentMonth}
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

      {(isManager || isMember) && (
        <QuickLogTrigger onOpen={() => setQuickLoggerOpen(true)} />
      )}

      <Suspense fallback={null}>
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
      </Suspense>

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
          collabPeople={bulkCollabPeople}
          onAddCollaborators={
            isAdmin ? undefined : (creatorIds) => handleAddCollaborators(selectedIds, creatorIds)
          }
          onHideRows={handleHideRows}
          onInsertAbove={() => handleInsertRow("above")}
          onInsertBelow={() => handleInsertRow("below")}
          onDuplicate={handleBulkDuplicate}
          onDelete={handleBulkDelete}
          onClear={() => setSelectedIds([])}
        />
      )}

      {loading ? (
        <WorkSheetTableSkeleton />
      ) : isPhone ? (
        <MobileWorkList
          items={sortedItems}
          currentUser={currentUser}
          users={users}
          options={options}
          projects={projects}
          deliverables={deliverables}
          clients={clients}
          hiddenRows={hiddenRows}
          onUpdate={handleUpdate}
        />
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
          collabIndex={collabIndex}
          onAddCollaborators={isAdmin ? undefined : handleAddCollaborators}
          onDelete={setDeleteTarget}
          onDuplicateRow={handleDuplicateRow}
          onFill={handleFill}
          onUndoable={pushUndo}
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
          groupBy={groupBy}
          onGroupCollapseStateChange={setAllGroupsCollapsed}
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