import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import {
  Check,
  Undo2,
  ChevronRight,
  ShieldCheck,
  Users,
  UserCheck,
  Search,
  X,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import { useAccess } from "@/hooks/useAccess";
import { refreshCounts } from "@/lib/countsBus";
import {
  getApprovalBoard,
  approveApprovalItem,
  sendBackApprovalItem,
  moveApprovalItem,
} from "@/services/api";
import { APPROVALS } from "@/constants/testIds";
import ApprovalsFilterModal from "@/components/approvals/ApprovalsFilterModal";
import { trackEvent } from "../analytics";

const COLUMNS = [
  {
    key: "MANAGER",
    label: "Manager",
    icon: Users,
    description: "Internal manager sign-off",
  },
  {
    key: "LEADERSHIP",
    label: "Leadership",
    icon: ShieldCheck,
    description: "Leadership review",
  },
  {
    key: "CLIENT_SPOC",
    label: "Client SPOC",
    icon: UserCheck,
    description: "Client sign-off",
  },
  {
    key: "COMPLIANCE",
    label: "Compliance",
    icon: ShieldCheck,
    description: "Compliance review",
  },
];

const initialBoard = () =>
  Object.fromEntries(COLUMNS.map((column) => [column.key, []]));

const ageLabel = (isoDate) => {
  if (!isoDate) return "—";
  try {
    return `${formatDistanceToNowStrict(parseISO(isoDate))} ago`;
  } catch {
    return "—";
  }
};

const isEditableTarget = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
};

// Shortcuts need Ctrl (Windows/Linux) or Cmd (Mac) held down. Plain letters
// used to trigger them, and people typing or just resting on the keyboard
// approved or sent back items by accident.
const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");
const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl";

const KBD_CLASS =
  "inline-flex h-[18px] items-center rounded px-[5px] text-[10px] font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(234,238,244,1)]";

export default function ApprovalsPage() {
  const { currentUser, currentUserId, loading: userLoading } = useUser();
  const access = useAccess();
  // Everyone can open Approvals; only managers can approve, send back or
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
  const [activeQueue, setActiveQueue] = useState(COLUMNS[0].key);
  const [selectedId, setSelectedId] = useState(null);

  // Filters. Visibility/hidden toggle and the old per-column "authority"
  // filter are both gone — authority is now the queue tab itself, and
  // hide/unhide isn't part of this redesign, so there's no separate
  // "hidden" set to filter in or out of.
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Gmail-style bulk selection, scoped to whatever's currently visible in
  // the active queue (selecting in one queue and switching tabs clears it
  // — same as Gmail resetting its selection when you change labels).
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchBoard = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);

    try {
      const data = await getApprovalBoard(currentUserId, {
        visibility: "visible",
      });
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

    const refresh = () => {
      if (document.hidden || busyRef.current) return;
      fetchBoard({ silent: true });
    };

    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
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

    if (dateFrom || dateTo) {
      // Compare on the viewer's calendar day. Slicing the UTC timestamp put
      // anything requested in the early hours (IST) on the previous day.
      let requested = null;
      try {
        requested = item.requested_at
          ? format(parseISO(item.requested_at), "yyyy-MM-dd")
          : null;
      } catch {
        requested = null;
      }
      if (!requested) return false;
      if (dateFrom && requested < dateFrom) return false;
      if (dateTo && requested > dateTo) return false;
    }

    const q = search.trim().toLowerCase();
    if (!q) return true;

    return (
      (item.project_name || "").toLowerCase().includes(q) ||
      (item.deliverable_name || "").toLowerCase().includes(q) ||
      (item.client_name || "").toLowerCase().includes(q) ||
      (item.project_code || "").toLowerCase().includes(q)
    );
  };

  const filteredBoard = useMemo(() => {
    const next = {};
    for (const column of COLUMNS) {
      next[column.key] = (board[column.key] || []).filter(matchesFilters);
    }
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, search, stageFilter, projectFilter, dateFrom, dateTo]);

  const activeFilterCount = [stageFilter, projectFilter, dateFrom || dateTo ? "date" : ""].filter(
    Boolean
  ).length;

  const handleApplyFilters = (values) => {
    setStageFilter(values.stageFilter);
    setProjectFilter(values.projectFilter);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeQueue, aList.map((i) => i.id).join(",")]);

  // ---------- Selection (bulk) ----------
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
  const decide = async (item, action) => {
    if (!canAct || !item) return;
    const note = notes[item.id] || "";

    try {
      if (action === "approve") {
        await approveApprovalItem(currentUserId, item.id, note);
      } else {
        await sendBackApprovalItem(currentUserId, item.id, note);
      }

      trackEvent(action === "approve" ? "approval_approved" : "approval_sent_back", {
        approval_item_id: item.id,
        approval_type: item.approval_type,
      });

      toast.success(action === "approve" ? "Approval recorded" : "Sent back for changes");

      setNotes((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });

      await fetchBoard();
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
  const handleBulkApprove = async () => {
    const ids = [...selectedIds];
    if (!canAct || !ids.length) return;
    setBulkLoading(true);

    try {
      const results = await Promise.allSettled(
        ids.map((id) => approveApprovalItem(currentUserId, id, ""))
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      toast.success(`${succeeded} of ${ids.length} approval${ids.length === 1 ? "" : "s"} approved`);
      await fetchBoard();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkSendBack = async () => {
    const ids = [...selectedIds];
    if (!canAct || !ids.length) return;
    setBulkLoading(true);

    try {
      const results = await Promise.allSettled(
        ids.map((id) => sendBackApprovalItem(currentUserId, id, ""))
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      toast.success(`${succeeded} of ${ids.length} sent back`);
      await fetchBoard();
    } finally {
      setBulkLoading(false);
    }
  };

  // ---------- Keyboard shortcuts ----------
  // Ctrl/Cmd + J / K  move down / up the list (the arrow keys work too)
  // Ctrl/Cmd + A      approve the selected item
  // Ctrl/Cmd + S      send the selected item back
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
        decide(aSel, "approve");
      } else if (key === "s" && aSel && canAct) {
        event.preventDefault(); // otherwise the browser offers to save the page
        decide(aSel, "send_back");
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aList, selectedId, aSel, notes, canAct]);

  if (userLoading || !currentUser) return null;

  return (
    <div data-testid={APPROVALS.page} className="flex h-full flex-col bg-background">
      {/* HEADER */}
      <div className="flex items-center gap-3 px-5 pt-5">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight text-foreground">Approvals</h1>

        {canAct && selectedIds.size > 0 ? (
          // Gmail-style contextual bar — replaces the hint row the moment
          // anything is checked.
          <div className="flex items-center gap-2 rounded-lg bg-[#f0f0fd] px-3 py-1.5">
            <span className="text-xs font-semibold text-[#2b2bb5]">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              data-testid={APPROVALS.bulkApproveBtn}
              onClick={handleBulkApprove}
              disabled={bulkLoading}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-[#2b2bb5] px-2.5 text-xs font-semibold text-white hover:bg-[#1a1a8a] disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              Approve
            </button>
            <button
              type="button"
              data-testid={APPROVALS.bulkSendBackBtn}
              onClick={handleBulkSendBack}
              disabled={bulkLoading}
              className="inline-flex h-7 items-center gap-1 rounded-md bg-white px-2.5 text-xs font-semibold text-foreground shadow-[inset_0_0_0_1px_rgba(226,232,240,1)] hover:bg-slate-50 disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Send back
            </button>
            <button
              type="button"
              aria-label="Clear selection"
              onClick={clearSelection}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#2b2bb5] hover:bg-[#e4e4fb]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="hidden items-center gap-2.5 text-xs text-muted-foreground md:flex">
            {!canAct && (
              <span
                data-testid="approvals-view-only"
                title="Only managers can approve or send items back"
                className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
              >
                View only
              </span>
            )}
            <span className="flex items-center gap-1">
              <kbd className={KBD_CLASS}>{MOD_LABEL}+J</kbd>
              <kbd className={KBD_CLASS}>{MOD_LABEL}+K</kbd>
              move
            </span>
            {canAct && (
              <>
                <span className="flex items-center gap-1">
                  <kbd className={KBD_CLASS}>{MOD_LABEL}+A</kbd>
                  approve
                </span>
                <span className="flex items-center gap-1">
                  <kbd className={KBD_CLASS}>{MOD_LABEL}+S</kbd>
                  send back
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* QUEUE TABS — also drop targets for drag-to-reassign */}
      <div
        role="tablist"
        aria-label="Approval queues"
        className="mt-3 flex gap-1 overflow-x-auto px-5 shadow-[inset_0_-1px_0_rgba(234,238,244,1)]"
      >
        {COLUMNS.map((column) => {
          const Icon = column.icon;
          const isActive = activeQueue === column.key;
          const isDropTarget = dragOverQueue === column.key && dragging?.approval_type !== column.key;

          return (
            <button
              key={column.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveQueue(column.key)}
              onDragOver={(e) => {
                if (!dragging || dragging.approval_type === column.key) return;
                e.preventDefault();
                setDragOverQueue(column.key);
              }}
              onDragLeave={() => setDragOverQueue((cur) => (cur === column.key ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverQueue(null);
                if (dragging) handleMove(dragging, column.key);
                setDragging(null);
              }}
              className={[
                "flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
                isDropTarget ? "bg-[#f0f0fd]" : "",
              ].join(" ")}
            >
              <Icon className="h-3.5 w-3.5" />
              {column.label}
              <span
                className={[
                  "inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                  isActive ? "bg-[#2b2bb5] text-white" : "bg-slate-100 text-slate-600",
                ].join(" ")}
              >
                {filteredBoard[column.key]?.length ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* SEARCH + FILTER ROW */}
      <div className="flex items-center gap-2 px-5 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            data-testid={APPROVALS.searchInput}
            placeholder="Search deliverable, project, client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-64 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-800 outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
          />
        </div>

        <ApprovalsFilterModal
          stages={stageOptions}
          projectOptions={projectOptions}
          initialValues={{ stageFilter, projectFilter, dateFrom, dateTo }}
          onApply={handleApplyFilters}
          activeFilterCount={activeFilterCount}
        />
      </div>

      {/* BODY: master list + detail */}
      <div className="flex min-h-0 flex-1">
        {/* LIST */}
        <div className="flex w-[360px] shrink-0 flex-col border-r border-slate-200">
          <div className="flex h-10 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
            {canAct && (
              <input
                type="checkbox"
                aria-label="Select all in this queue"
                checked={allInQueueSelected}
                onChange={toggleSelectAllInQueue}
                disabled={aList.length === 0}
                className="h-4 w-4 rounded border-slate-300 text-[#2b2bb5] accent-[#2b2bb5]"
              />
            )}
            <span className="text-xs text-slate-500">
              {aList.length} pending
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading…</div>
            ) : aList.length === 0 ? (
              <div
                data-testid={APPROVALS.emptyState}
                className="flex flex-col items-center gap-1.5 px-5 py-10 text-center"
              >
                <span className="text-sm font-semibold text-foreground">No pending approvals</span>
                <span className="text-xs text-muted-foreground">This queue is clear.</span>
              </div>
            ) : (
              aList.map((item) => {
                const isSelected = item.id === selectedId;
                const checked = selectedIds.has(item.id);

                return (
                  <div
                    key={item.id}
                    data-testid={`${APPROVALS.listRowPrefix}-${item.id}`}
                    draggable={canAct && !movingId}
                    onDragStart={() => setDragging(item)}
                    onDragEnd={() => {
                      setDragging(null);
                      setDragOverQueue(null);
                    }}
                    onClick={() => setSelectedId(item.id)}
                    className={[
                      "flex w-full cursor-pointer items-start gap-2.5 border-b border-slate-100 px-4 py-3 text-left transition-colors",
                      isSelected ? "bg-[#f0f0fd]" : "hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {canAct && (
                      <input
                        type="checkbox"
                        data-testid={`${APPROVALS.checkboxPrefix}-${item.id}`}
                        checked={checked}
                        onChange={() => toggleSelect(item.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-[#2b2bb5] accent-[#2b2bb5]"
                        aria-label={`Select ${item.deliverable_name}`}
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-medium text-slate-500">
                          {item.project_code}
                        </span>
                        <span className="flex-1" />
                        <span className="text-xs text-slate-500">{ageLabel(item.requested_at)}</span>
                      </div>
                      <div className="mt-1 truncate text-sm font-semibold leading-5 text-slate-900">
                        {item.deliverable_name}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {item.project_name} · {item.client_name || "—"}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* DETAIL */}
        <div className="flex-1 overflow-y-auto">
          {aSel ? (
            <div className="max-w-[720px] px-7 pb-10 pt-6">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex min-w-[240px] flex-1 flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      Pending
                    </span>
                    <span className="text-xs font-medium text-slate-500">{aSel.project_code}</span>
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">
                    {aSel.deliverable_name}
                  </h2>
                </div>

                {canAct && (
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <span className="text-xs text-slate-500">Move to</span>
                  {COLUMNS.filter((c) => c.key !== aSel.approval_type).map((c) => (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => handleMove(aSel, c.key)}
                      disabled={movingId === aSel.id}
                      className="h-7 rounded-lg bg-white px-2.5 text-xs text-slate-700 shadow-[inset_0_0_0_1px_rgba(226,232,240,1)] hover:bg-slate-50 disabled:opacity-50"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                )}
              </div>

              <div className="mt-5 grid grid-cols-[130px_1fr] gap-y-2.5 text-sm">
                <span className="text-slate-500">Project</span>
                <span className="text-foreground">{aSel.project_name}</span>
                <span className="text-slate-500">Client</span>
                <span className="text-foreground">{aSel.client_name || "—"}</span>
                <span className="text-slate-500">Workflow</span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {(aSel.required_stages || [aSel.current_stage]).map((stage, i, arr) => (
                    <span key={stage} className="flex items-center gap-1.5">
                      <span
                        className={[
                          "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium",
                          stage === aSel.current_stage
                            ? "bg-[#2b2bb5] text-white"
                            : "bg-slate-100 text-slate-500",
                        ].join(" ")}
                      >
                        {stage}
                      </span>
                      {i < arr.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                    </span>
                  ))}
                </span>
              </div>

              {aSel.comments && (
                <div className="mt-5 rounded-lg border border-border bg-muted/50 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground">
                  {aSel.comments}
                </div>
              )}

              {canAct ? (
              <>
              <label className="mt-5 flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">Review note</span>
                <textarea
                  data-testid={`${APPROVALS.notePrefix}-${aSel.id}`}
                  placeholder="Optional for approval, required when sending back"
                  value={notes[aSel.id] || ""}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [aSel.id]: e.target.value }))
                  }
                  rows={3}
                  className="resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-5 outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
                />
              </label>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid={`${APPROVALS.approvePrefix}-${aSel.id}`}
                  onClick={() => decide(aSel, "approve")}
                  disabled={movingId === aSel.id}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2b2bb5] px-3.5 text-sm font-semibold text-white hover:bg-[#1a1a8a] disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  Approve
                </button>
                <button
                  type="button"
                  data-testid={`${APPROVALS.rejectPrefix}-${aSel.id}`}
                  onClick={() => decide(aSel, "send_back")}
                  disabled={movingId === aSel.id}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <Undo2 className="h-4 w-4 text-muted-foreground" />
                  Send back
                </button>
              </div>
              </>
              ) : (
                <div
                  data-testid="approvals-read-only-note"
                  className="mt-5 rounded-lg border border-border bg-muted/50 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground"
                >
                  You can follow this approval here. Only managers can approve it,
                  send it back or move it to another queue.
                </div>
              )}
            </div>
          ) : (
            !loading && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select an approval to review it
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}