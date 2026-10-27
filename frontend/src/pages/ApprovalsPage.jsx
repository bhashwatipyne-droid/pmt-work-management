import { makeMatcher } from "@/lib/search";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useUser } from "@/context/UserContext";
import { useAccess } from "@/hooks/useAccess";
import { refreshCounts } from "@/lib/countsBus";
import {
  getApprovalBoard,
  approveApprovalItem,
  bulkApproveApprovalItems,
  moveApprovalItem,
} from "@/services/api";
import { APPROVALS } from "@/constants/testIds";
import ApprovalsFilterModal from "@/components/approvals/ApprovalsFilterModal";
import { useUndo } from "@/hooks/useUndo";
import { consumePrefetch } from "@/services/prefetch";
import { trackEvent } from "../analytics";
import { COLUMNS, initialBoard, isEditableTarget } from "@/components/approvals/approvalsView";
import { ApprovalsDetail } from "@/components/approvals/ApprovalsDetail";
import { ApprovalsList } from "@/components/approvals/ApprovalsList";
import { ApprovalsSearchRow } from "@/components/approvals/ApprovalsSearchRow";
import { ApprovalsQueueTabs } from "@/components/approvals/ApprovalsQueueTabs";
import { ApprovalsHeader } from "@/components/approvals/ApprovalsHeader";

export default function ApprovalsPage() {
  const { currentUser, currentUserId, loading: userLoading } = useUser();
  // Ctrl/Cmd+Z undoes moving an item to another queue. Approving or sending
  // back advances the deliverable through its workflow (and notifies people),
  // so those are not undoable.
  const { pushUndo } = useUndo();
  const access = useAccess();
  // Everyone can open Approvals; only managers can approve or
  // move items between queues (lib/permissions.js, enforced by the API).
  const canAct = access.canActOnApprovals;

  const [board, setBoard] = useState(initialBoard);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});
  const [dragging, setDragging] = useState(null);
  const [movingId, setMovingId] = useState(null);
  const [dragOverQueue, setDragOverQueue] = useState(null);

  // Which queue (authority column) is active — the redesign replaces the
  // old Kanban board (all four columns visible at once) with one queue at
  // a time, navigated via tabs.
  const [activeQueue, setActiveQueue] = useSessionState("approvals-queue", COLUMNS[0].key);
  const [selectedId, setSelectedId] = useState(null);
  // Phones show the list OR the detail, never both side by side.
  const [detailOpen, setDetailOpen] = useState(false);

  // Filters. Visibility/hidden toggle and the old per-column "authority"
  // filter are both gone — authority is now the queue tab itself, and
  // hide/unhide isn't part of this redesign, so there's no separate
  // "hidden" set to filter in or out of.
  const [search, setSearch] = useSessionState("approvals-search", "");
  const [stageFilter, setStageFilter] = useSessionState("approvals-stage", "");
  const [projectFilter, setProjectFilter] = useSessionState("approvals-project", "");
  const [deadlineFilter, setDeadlineFilter] = useSessionState("approvals-deadline", "");
  const [dateFrom, setDateFrom] = useSessionState("approvals-date-from", "");
  const [dateTo, setDateTo] = useSessionState("approvals-date-to", "");

  // Gmail-style bulk selection, scoped to whatever's currently visible in
  // the active queue (selecting in one queue and switching tabs clears it
  // — same as Gmail resetting its selection when you change labels).
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const lastFetchRef = useRef(0);

  const fetchBoard = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);

    try {
      // The first open usually has this answer already on its way from boot
      // (services/prefetch); quiet refreshes always ask again.
      const loadBoard = () =>
        getApprovalBoard(currentUserId, { visibility: "visible" });
      const data = silent
        ? await loadBoard()
        : await consumePrefetch("approvals-board", loadBoard);
      lastFetchRef.current = Date.now();
      setBoard(data);

      if (!silent) {
        setSelectedIds(new Set());
      } else {
        const liveIds = new Set(
          Object.values(data || {}).flatMap((items) =>
            (items || []).map((item) => item.id)
          )
        );
        setSelectedIds((prev) => new Set([...prev].filter((id) => liveIds.has(id))));
      }

      refreshCounts();
    } catch (err) {
      if (!silent) {
        toast.error(err?.response?.data?.detail || "Failed to load approvals");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      trackEvent("approvals_opened", { role: currentUser.role });
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser) {
      fetchBoard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const busyRef = useRef(false);
  busyRef.current = Boolean(dragging) || Boolean(movingId) || bulkLoading;

  useEffect(() => {
    if (!currentUser) return undefined;

    // The board is refreshed every few minutes, and when the person returns to
    // the tab only if it has been a minute since the last refresh (it used to
    // reload every 30s and on every focus, even a quick alt-tab).
    let lastRefreshAt = Date.now();
    const refresh = ({ minGapMs = 0 } = {}) => {
      if (document.hidden || busyRef.current) return;
      if (Date.now() - lastRefreshAt < minGapMs) return;
      lastRefreshAt = Date.now();
      fetchBoard({ silent: true });
    };
    const onReturn = () => refresh({ minGapMs: 60000 });

    const timer = window.setInterval(refresh, 3 * 60 * 1000);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUserId]);

  // Switching queues clears the bulk selection (Gmail does the same when
  // you switch labels).
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeQueue]);

  const stageOptions = useMemo(() => {
    const stages = new Set();
    COLUMNS.forEach((column) => {
      (board[column.key] || []).forEach((item) => {
        if (item.current_stage) stages.add(item.current_stage);
      });
    });
    return [...stages].sort();
  }, [board]);

  const projectOptions = useMemo(() => {
    const names = new Set();
    COLUMNS.forEach((column) => {
      (board[column.key] || []).forEach((item) => {
        if (item.project_name) names.add(item.project_name);
      });
    });
    return [...names].sort();
  }, [board]);

  const matchesFilters = (item) => {
    if (stageFilter && item.current_stage !== stageFilter) return false;
    if (projectFilter && item.project_name !== projectFilter) return false;
    if (deadlineFilter === "with" && !item.due_date) return false;
    if (deadlineFilter === "without" && item.due_date) return false;

    if (dateFrom || dateTo) {
      // Filter on the deadline - the same date the "Overdue" / "Due" chip is
      // worked out from. (It used to compare the date the approval was
      // requested, so an item 40 days overdue vanished from a recent range.)
      const due = String(item.due_date || "").slice(0, 10);
      if (!due) return false;
      if (dateFrom && due < dateFrom) return false;
      if (dateTo && due > dateTo) return false;
    }

    return makeMatcher(search)(
      item.project_name,
      item.deliverable_name,
      item.client_name
    );
  };

  const filteredBoard = useMemo(() => {
    const next = {};
    for (const column of COLUMNS) {
      next[column.key] = (board[column.key] || []).filter(matchesFilters);
    }
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, search, stageFilter, projectFilter, deadlineFilter, dateFrom, dateTo]);

  const activeFilterCount = [stageFilter, projectFilter, deadlineFilter, dateFrom || dateTo ? "date" : ""].filter(
    Boolean
  ).length;

  const handleApplyFilters = (values) => {
    setStageFilter(values.stageFilter);
    setProjectFilter(values.projectFilter);
    setDeadlineFilter(values.deadlineFilter || "");
    setDateFrom(values.dateFrom);
    setDateTo(values.dateTo);
  };

  const aList = filteredBoard[activeQueue] || [];
  const aSel = aList.find((item) => item.id === selectedId) || null;

  // If the selected item falls out of the active queue's filtered list
  // (filters changed, the item moved, or it was just approved/sent back),
  // fall back to the first row rather than showing a stale/empty detail
  // pane.
  useEffect(() => {
    if (!aList.some((item) => item.id === selectedId)) {
      setSelectedId(aList[0]?.id ?? null);
    }
    if (aList.length === 0) setDetailOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueue, aList.map((i) => i.id).join(",")]);

  // ---------- Opened from a notification ----------
  // /approvals?deliverable=<id>[&item=<approval item id>] opens straight on
  // that deliverable: its queue is selected, any filters that would hide it
  // are cleared, and its card is highlighted with the detail pane open, ready
  // to approve.
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const targetDeliverable = searchParams.get("deliverable");
  const targetItem = searchParams.get("item");
  const [retriedTarget, setRetriedTarget] = useState(null);
  const [scrollToId, setScrollToId] = useState(null);

  useEffect(() => {
    if (!targetDeliverable || loading || !currentUser) return;

    const key = `${targetDeliverable}|${targetItem || ""}`;
    const all = COLUMNS.flatMap((column) =>
      (board[column.key] || []).map((item) => ({ column: column.key, item }))
    );
    const hit =
      (targetItem && all.find((entry) => entry.item.id === targetItem)) ||
      all.find((entry) => entry.item.deliverable_id === targetDeliverable);

    if (hit) {
      setSearch("");
      setStageFilter("");
      setProjectFilter("");
      setDeadlineFilter("");
      setDateFrom("");
      setDateTo("");
      setActiveQueue(hit.column);
      setSelectedId(hit.item.id);
      setScrollToId(hit.item.id);
      setSearchParams({}, { replace: true });
      return;
    }

    // Not on the board we have. It may have only just been sent for
    // approval, so look once more before giving up (unless the board was
    // fetched a moment ago).
    if (retriedTarget !== key && Date.now() - lastFetchRef.current > 3000) {
      fetchBoard({ silent: true }).finally(() => setRetriedTarget(key));
      return;
    }

    // A delay notice can be for a deliverable still with its team, which is
    // not on this board: show its rows in the work sheet instead.
    if (searchParams.get("fallback") === "worksheet") {
      const name = searchParams.get("name");
      toast.info("This deliverable is not waiting for approval yet - showing it in the work sheet.");
      navigate("/", name ? { replace: true, state: { search: name } } : { replace: true });
      return;
    }

    toast.info(
      "That deliverable is no longer waiting in Approvals - it may already have been approved or sent back."
    );
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDeliverable, targetItem, loading, board, retriedTarget, currentUser?.id]);

  useEffect(() => {
    if (!scrollToId) return;
    const el = document.querySelector(
      `[data-testid="${APPROVALS.listRowPrefix}-${scrollToId}"]`
    );
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    setScrollToId(null);
  }, [scrollToId, activeQueue, board]);

  // ---------- Selection (bulk) ----------
  const toggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openRow = useCallback((id) => {
    setSelectedId(id);
    setDetailOpen(true);
  }, []);

  const startDrag = useCallback((item) => setDragging(item), []);
  const endDrag = useCallback(() => {
    setDragging(null);
    setDragOverQueue(null);
  }, []);

  const allInQueueSelected = aList.length > 0 && aList.every((item) => selectedIds.has(item.id));

  const toggleSelectAllInQueue = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allInQueueSelected) {
        aList.forEach((item) => next.delete(item.id));
      } else {
        aList.forEach((item) => next.add(item.id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ---------- Single-item actions ----------
  const decide = async (item) => {
    if (!canAct || !item) return;
    const note = notes[item.id] || "";

    try {
      await approveApprovalItem(currentUserId, item.id, note);

      trackEvent("approval_approved", {
        approval_item_id: item.id,
        approval_type: item.approval_type,
      });

      toast.success("Approval recorded");

      setNotes((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });

      removeFromBoard([item.id]);
      fetchBoard({ silent: true });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Action failed");
    }
  };

  const handleMove = async (item, targetType) => {
    if (!canAct || !item || item.approval_type === targetType) return;

    const sourceType = item.approval_type;
    const previousBoard = board;

    setBoard((currentBoard) => {
      const nextBoard = { ...currentBoard };
      const sourceItems = [...(nextBoard[sourceType] || [])];
      const targetItems = [...(nextBoard[targetType] || [])];
      const index = sourceItems.findIndex((i) => i.id === item.id);
      if (index === -1) return currentBoard;

      const [movedItem] = sourceItems.splice(index, 1);
      nextBoard[sourceType] = sourceItems;
      nextBoard[targetType] = [{ ...movedItem, approval_type: targetType }, ...targetItems];
      return nextBoard;
    });

    setMovingId(item.id);

    try {
      await moveApprovalItem(currentUserId, item.id, targetType);
      pushUndo("moved approval", async () => {
        await moveApprovalItem(currentUserId, item.id, sourceType);
        await fetchBoard({ silent: true });
      });
      trackEvent("approval_assignee_changed", {
        approval_item_id: item.id,
        from_approval_type: sourceType,
        to_approval_type: targetType,
      });
      toast.success(`Moved to ${COLUMNS.find((c) => c.key === targetType)?.label}`);
    } catch (err) {
      setBoard(previousBoard);
      toast.error(
        err?.response?.data?.detail || err?.message || "Could not move approval"
      );
    } finally {
      setMovingId(null);
    }
  };

  // ---------- Bulk actions ----------
  // Take the given items off the board right away so the click feels
  // instant; the server confirms in the background and a silent refresh
  // restores anything that didn't go through.
  const removeFromBoard = (ids) => {
    const gone = new Set(ids);
    setBoard((current) => {
      const next = {};
      for (const key of Object.keys(current || {})) {
        next[key] = (current[key] || []).filter((item) => !gone.has(item.id));
      }
      return next;
    });
  };

  const handleBulkApprove = async () => {
    const ids = [...selectedIds];
    if (!canAct || !ids.length) return;
    setBulkLoading(true);
    removeFromBoard(ids);
    clearSelection();

    try {
      // One request for the whole selection (the server groups by
      // deliverable and limits concurrency) instead of N parallel calls.
      const result = await bulkApproveApprovalItems(currentUserId, ids, "");
      const succeeded = (result?.approved || []).length;
      const failedCount = (result?.failed || []).length;
      toast.success(`${succeeded} of ${ids.length} approval${ids.length === 1 ? "" : "s"} approved`);
      if (failedCount) {
        toast.error(`${failedCount} could not be approved (already handled or not allowed)`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Bulk approve failed");
    } finally {
      setBulkLoading(false);
      fetchBoard({ silent: true });
    }
  };

  // ---------- Keyboard shortcuts ----------
  // Ctrl/Cmd + J / K  move down / up the list (the arrow keys work too)
  // Ctrl/Cmd + A      approve the selected item
  // Inside a text field nothing here fires, so Select All / typing behave
  // normally there.
  useEffect(() => {
    const moveSelection = (delta) => {
      const idx = aList.findIndex((item) => item.id === selectedId);
      const nextIndex = Math.min(aList.length - 1, Math.max(0, idx + delta));
      const next = aList[nextIndex];
      if (next) setSelectedId(next.id);
    };

    const handleKeyDown = (event) => {
      if (isEditableTarget(event.target)) return;
      if (event.altKey || event.shiftKey) return;

      const key = event.key.toLowerCase();
      const hasModifier = event.metaKey || event.ctrlKey;

      if (!hasModifier) {
        if (key === "arrowdown") {
          event.preventDefault();
          moveSelection(1);
        } else if (key === "arrowup") {
          event.preventDefault();
          moveSelection(-1);
        }
        return;
      }

      if (key === "j") {
        event.preventDefault();
        moveSelection(1);
      } else if (key === "k") {
        event.preventDefault();
        moveSelection(-1);
      } else if (key === "a" && aSel && canAct) {
        event.preventDefault(); // otherwise the browser selects the whole page
        decide(aSel);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aList, selectedId, aSel, notes, canAct]);

  if (userLoading || !currentUser) return null;

  const ctx = {
    aList,
    aSel,
    activeFilterCount,
    activeQueue,
    allInQueueSelected,
    bulkLoading,
    canAct,
    clearSelection,
    dateFrom,
    dateTo,
    deadlineFilter,
    decide,
    detailOpen,
    dragOverQueue,
    dragging,
    endDrag,
    filteredBoard,
    handleApplyFilters,
    handleBulkApprove,
    handleMove,
    loading,
    movingId,
    notes,
    openRow,
    projectFilter,
    projectOptions,
    search,
    selectedId,
    selectedIds,
    setActiveQueue,
    setDetailOpen,
    setDragOverQueue,
    setDragging,
    setNotes,
    setSearch,
    stageFilter,
    stageOptions,
    startDrag,
    toggleSelect,
    toggleSelectAllInQueue,
  };

  return (
    <div data-testid={APPROVALS.page} className="flex h-full flex-col bg-background">
      <ApprovalsHeader {...ctx} />

      <ApprovalsQueueTabs {...ctx} />

      <ApprovalsSearchRow {...ctx} />

      {/* BODY: master list + detail */}
      <div className="flex min-h-0 flex-1">
        <ApprovalsList {...ctx} />

        <ApprovalsDetail {...ctx} />
      </div>
    </div>
  );
}