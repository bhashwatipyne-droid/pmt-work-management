import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  CheckCircle2,
  XCircle,
  GripVertical,
  Clock3,
  ShieldCheck,
  Users,
  UserCheck,
  Search,
  Eye,
  EyeOff,
  MoreVertical,
  LayoutGrid,
  List,
  X,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import {
  getApprovalBoard,
  approveApprovalItem,
  sendBackApprovalItem,
  moveApprovalItem,
  hideApprovalItem,
  unhideApprovalItem,
  bulkHideApprovalItems,
  bulkUnhideApprovalItems,
} from "@/services/api";
import { APPROVALS } from "@/constants/testIds";
import { KanbanBoard } from "@/components/ui/KanbanBoard";
import { KanbanColumn } from "@/components/ui/KanbanColumn";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import ApprovalsFilterModal from "@/components/approvals/ApprovalsFilterModal";
import { STAGES } from "@/constants/projectPalette";
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

export default function ApprovalsPage() {
  const { currentUser, currentUserId, loading: userLoading } = useUser();

  const [board, setBoard] = useState(initialBoard);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});
  const [dragging, setDragging] = useState(null);
  const [movingId, setMovingId] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [authorityFilter, setAuthorityFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [visibility, setVisibility] = useState("visible");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [view, setView] = useState("grid");

  // Selection + bulk actions
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchBoard = async () => {
    setLoading(true);

    try {
      const data = await getApprovalBoard(currentUserId, { visibility });
      setBoard(data);
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to load approvals"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && currentUser.role !== "member") {
      trackEvent("approvals_opened", {
        role: currentUser.role,
      });
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser && currentUser.role !== "member") {
      fetchBoard();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, visibility]);

  const total = useMemo(
    () =>
      COLUMNS.reduce(
        (sum, column) => sum + (board[column.key]?.length || 0),
        0
      ),
    [board]
  );

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
    if (authorityFilter && item.approval_type !== authorityFilter) {
      return false;
    }

    if (stageFilter && item.current_stage !== stageFilter) {
      return false;
    }

    if (projectFilter && item.project_name !== projectFilter) {
      return false;
    }

    if (dateFrom || dateTo) {
      const requested = item.requested_at
        ? item.requested_at.slice(0, 10)
        : null;

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
  }, [board, search, authorityFilter, stageFilter, projectFilter, dateFrom, dateTo]);

  const visibleColumns = authorityFilter
    ? COLUMNS.filter((c) => c.key === authorityFilter)
    : COLUMNS;

  const filteredTotal = visibleColumns.reduce(
    (sum, column) => sum + (filteredBoard[column.key]?.length || 0),
    0
  );

  const hasActiveFilters =
    Boolean(search) ||
    Boolean(authorityFilter) ||
    Boolean(stageFilter) ||
    Boolean(projectFilter) ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    visibility !== "all";

  const activeFilterCount = [
    authorityFilter,
    stageFilter,
    projectFilter,
    dateFrom || dateTo ? "date" : "",
    visibility !== "all" ? "status" : "",
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearch("");
    setAuthorityFilter("");
    setStageFilter("");
    setProjectFilter("");
    setDateFrom("");
    setDateTo("");
    setVisibility("all");
    clearSelection();
  };

  const handleApplyFilters = (values) => {
    setAuthorityFilter(values.authorityFilter);
    setStageFilter(values.stageFilter);

    if (values.visibility !== visibility) {
      setVisibility(values.visibility);
      clearSelection();
    }

    setProjectFilter(values.projectFilter);
    setDateFrom(values.dateFrom);
    setDateTo(values.dateTo);
  };

  // ---------- Selection ----------
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  const toggleSelectColumn = (columnKey) => {
    const ids = (filteredBoard[columnKey] || []).map((item) => item.id);

    if (!ids.length) return;

    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));

      ids.forEach((id) => {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      });

      return next;
    });
  };

  const selectAllFiltered = () => {
    const ids = visibleColumns.flatMap((column) =>
      (filteredBoard[column.key] || []).map((item) => item.id)
    );

    setSelectedIds(new Set(ids));
  };

  const clearSelection = () => setSelectedIds(new Set());

  // ---------- Single-card actions ----------
  const decide = async (item, action) => {
    const note = notes[item.id] || "";

    try {
      if (action === "approve") {
        await approveApprovalItem(currentUserId, item.id, note);
      } else {
        await sendBackApprovalItem(currentUserId, item.id, note);
      }

      trackEvent(
        action === "approve" ? "approval_approved" : "approval_sent_back",
        {
          approval_item_id: item.id,
          approval_type: item.approval_type,
        }
      );

      toast.success(
        action === "approve" ? "Approval recorded" : "Sent back for changes"
      );

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

  const toggleHide = async (item) => {
    try {
      if (item.hidden) {
        await unhideApprovalItem(currentUserId, item.id);
        toast.success("Approval restored");
      } else {
        await hideApprovalItem(currentUserId, item.id);
        toast.success("Approval hidden");
      }

      await fetchBoard();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Could not update visibility"
      );
    }
  };

  // ---------- Bulk actions ----------
  const handleBulkApprove = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;

    setBulkLoading(true);

    try {
      const results = await Promise.allSettled(
        ids.map((id) => approveApprovalItem(currentUserId, id, ""))
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;

      toast.success(
        `${succeeded} of ${ids.length} approval${ids.length === 1 ? "" : "s"} approved`
      );

      await fetchBoard();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkSendBack = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;

    setBulkLoading(true);

    try {
      const results = await Promise.allSettled(
        ids.map((id) => sendBackApprovalItem(currentUserId, id, ""))
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;

      toast.success(
        `${succeeded} of ${ids.length} sent back`
      );

      await fetchBoard();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkReassign = async (targetType) => {
    const ids = [...selectedIds];
    if (!ids.length || !targetType) return;

    setBulkLoading(true);

    try {
      const results = await Promise.allSettled(
        ids.map((id) => moveApprovalItem(currentUserId, id, targetType))
      );

      const succeeded = results.filter((r) => r.status === "fulfilled").length;

      toast.success(
        `${succeeded} of ${ids.length} moved to ${
          COLUMNS.find((c) => c.key === targetType)?.label
        }`
      );

      await fetchBoard();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkHide = async () => {
    const ids = [...selectedIds];
    if (!ids.length) return;

    setBulkLoading(true);

    try {
      if (visibility === "hidden") {
        await bulkUnhideApprovalItems(currentUserId, ids);
        toast.success(`${ids.length} approval${ids.length === 1 ? "" : "s"} restored`);
      } else {
        await bulkHideApprovalItems(currentUserId, ids);
        toast.success(`${ids.length} approval${ids.length === 1 ? "" : "s"} hidden`);
      }

      await fetchBoard();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Could not update visibility"
      );
    } finally {
      setBulkLoading(false);
    }
  };

  /**
   * Optimistically move the card immediately.
   *
   * We do NOT reload the entire board after the API call.
   * If the API fails, the original board is restored.
   */
  const handleDrop = async (targetType) => {
    if (!dragging) return;

    const sourceType = dragging.approval_type;
    const approvalItemId = dragging.id;

    if (sourceType === targetType) {
      setDragging(null);
      return;
    }

    const previousBoard = board;

    setBoard((currentBoard) => {
      const nextBoard = { ...currentBoard };
      const sourceItems = [...(nextBoard[sourceType] || [])];
      const targetItems = [...(nextBoard[targetType] || [])];

      const index = sourceItems.findIndex(
        (item) => item.id === approvalItemId
      );

      if (index === -1) return currentBoard;

      const [movedItem] = sourceItems.splice(index, 1);
      const updatedItem = { ...movedItem, approval_type: targetType };

      nextBoard[sourceType] = sourceItems;
      nextBoard[targetType] = [updatedItem, ...targetItems];

      return nextBoard;
    });

    setDragging(null);
    setMovingId(approvalItemId);

    try {
      await moveApprovalItem(currentUserId, approvalItemId, targetType);

      trackEvent("approval_assignee_changed", {
        approval_item_id: approvalItemId,
        from_approval_type: sourceType,
        to_approval_type: targetType,
      });

      toast.success(
        `Moved to ${COLUMNS.find((c) => c.key === targetType)?.label}`
      );
    } catch (err) {
      setBoard(previousBoard);
      console.error("Approval move failed:", err);

      toast.error(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          err?.message ||
          "Could not move approval"
      );
    } finally {
      setMovingId(null);
    }
  };

  if (userLoading || !currentUser) return null;

  if (currentUser.role === "member") {
    return (
      <div className="flex flex-1 items-center justify-center bg-background p-8">
        <div className="text-center">
          <div className="text-sm font-medium text-foreground">
            Approvals is available to managers and admins only
          </div>

          <div className="mt-1 text-xs text-muted-foreground">
            Ask a manager or admin to review deliverables.
          </div>
        </div>
      </div>
    );
  }

  const renderCardMenu = (item) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-slate-100 hover:text-foreground"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => decide(item, "approve")}>
          <CheckCircle2 className="h-4 w-4" />
          Approve
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => decide(item, "reject")}>
          <XCircle className="h-4 w-4" />
          Send back
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => toggleHide(item)}>
          {item.hidden ? (
            <>
              <Eye className="h-4 w-4" />
              Unhide
            </>
          ) : (
            <>
              <EyeOff className="h-4 w-4" />
              Hide
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div
      data-testid={APPROVALS.page}
      className="flex-1 overflow-auto bg-background px-6 py-6 lg:px-8"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Approvals
            </h1>

            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
              {total}
            </span>
          </div>

          <p className="mt-1.5 text-sm text-muted-foreground">
            Independent approval queues. Drag a card to reassign its
            approval authority, or approve/send it back.
          </p>
        </div>
      </div>

      {/* Filters row */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

          <input
            data-testid={APPROVALS.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search project, deliverable, client, or code..."
            className="h-10 w-full rounded-lg border border-input bg-white pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
          />
        </div>

        <ApprovalsFilterModal
          columns={COLUMNS}
          stages={STAGES}
          projectOptions={projectOptions}
          initialValues={{
            authorityFilter,
            stageFilter,
            visibility,
            projectFilter,
            dateFrom,
            dateTo,
          }}
          onApply={handleApplyFilters}
          activeFilterCount={activeFilterCount}
        />

        {/* View toggle */}
        <div className="flex h-10 shrink-0 items-center rounded-lg border border-input bg-white p-1">
          <button
            type="button"
            data-testid={APPROVALS.gridViewBtn}
            onClick={() => setView("grid")}
            title="Grid view"
            aria-label="Grid view"
            className={[
              "flex h-8 w-9 items-center justify-center rounded-md transition-colors",
              view === "grid"
                ? "bg-[#f0f0ff] text-[#2b2bb5]"
                : "text-muted-foreground hover:bg-muted",
            ].join(" ")}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>

          <button
            type="button"
            data-testid={APPROVALS.listViewBtn}
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

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              Search: {search}
              <X className="h-3 w-3" />
            </button>
          )}

          {authorityFilter && (
            <button
              type="button"
              onClick={() => setAuthorityFilter("")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              Authority: {COLUMNS.find((c) => c.key === authorityFilter)?.label}
              <X className="h-3 w-3" />
            </button>
          )}

          {visibility !== "all" && (
            <button
              type="button"
              onClick={() => {
                setVisibility("all");
                clearSelection();
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              Status: {visibility === "hidden" ? "Hidden" : "Pending"}
              <X className="h-3 w-3" />
            </button>
          )}

          {stageFilter && (
            <button
              type="button"
              onClick={() => setStageFilter("")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              Stage: {stageFilter}
              <X className="h-3 w-3" />
            </button>
          )}

          {projectFilter && (
            <button
              type="button"
              onClick={() => setProjectFilter("")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              Project: {projectFilter}
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

          <button
            type="button"
            onClick={clearAllFilters}
            className="text-xs font-medium text-[#2b2bb5] hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9d9f5] bg-[#f5f5ff] px-4 py-2.5">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-[#1a1a8a]">
              {selectedIds.size} selected
            </span>

            {selectedIds.size < filteredTotal && (
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-xs font-semibold text-[#2b2bb5] hover:underline"
              >
                Select all {filteredTotal}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid={APPROVALS.bulkApproveBtn}
              onClick={handleBulkApprove}
              disabled={bulkLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2b2bb5] px-3 text-sm font-medium text-white hover:bg-[#1a1a8a] disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve ({selectedIds.size})
            </button>

            <button
              type="button"
              data-testid={APPROVALS.bulkSendBackBtn}
              onClick={handleBulkSendBack}
              disabled={bulkLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground hover:bg-slate-50 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Send Back ({selectedIds.size})
            </button>

            <select
              data-testid={APPROVALS.bulkReassignSelect}
              defaultValue=""
              disabled={bulkLoading}
              onChange={(e) => {
                const target = e.target.value;
                if (!target) return;
                handleBulkReassign(target);
                e.target.value = "";
              }}
              className="h-9 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground outline-none disabled:opacity-50"
            >
              <option value="" disabled>
                Reassign ({selectedIds.size})
              </option>
              {COLUMNS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              data-testid={APPROVALS.bulkHideBtn}
              onClick={handleBulkHide}
              disabled={bulkLoading}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground hover:bg-slate-50 disabled:opacity-50"
            >
              {visibility === "hidden" ? (
                <>
                  <Eye className="h-4 w-4" />
                  Unhide ({selectedIds.size})
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4" />
                  Hide ({selectedIds.size})
                </>
              )}
            </button>

            <button
              type="button"
              onClick={clearSelection}
              className="ml-1 text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mint-card flex min-h-[280px] items-center justify-center">
          <div className="text-sm text-muted-foreground">
            Loading approvals...
          </div>
        </div>
      ) : view === "grid" ? (
        <KanbanBoard minWidth="1360px">
          {visibleColumns.map((column) => {
            const Icon = column.icon;
            const items = filteredBoard[column.key] || [];

            const isDropTarget =
              dragging && dragging.approval_type !== column.key;

            const allSelected =
              items.length > 0 &&
              items.every((item) => selectedIds.has(item.id));

            return (
              <KanbanColumn
                key={column.key}
                title={column.label}
                count={items.length}
                icon={Icon}
                description={column.description}
                empty={items.length === 0 ? "No pending approvals" : null}
                isDropTarget={isDropTarget}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(column.key);
                }}
                headerAction={
                  <input
                    type="checkbox"
                    data-testid={`${APPROVALS.columnSelectAllPrefix}-${column.key}`}
                    checked={allSelected}
                    disabled={items.length === 0}
                    onChange={() => toggleSelectColumn(column.key)}
                    aria-label={`Select all ${column.label} approvals`}
                    className="h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-[#2b2bb5] accent-[#2b2bb5] disabled:cursor-not-allowed disabled:opacity-40"
                  />
                }
              >
                {items.map((item) => {
                  const isMoving = movingId === item.id;
                  const selected = selectedIds.has(item.id);

                  return (
                    <div
                      key={item.id}
                      draggable={!isMoving}
                      onDragStart={(e) => {
                        setDragging(item);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(item.id));
                      }}
                      onDragEnd={() => setDragging(null)}
                      data-testid={`${APPROVALS.cardPrefix}-${item.id}`}
                      className={[
                        "rounded-xl border bg-white p-4 shadow-sm transition-all",
                        selected
                          ? "border-[#2b2bb5] bg-[#fafaff] ring-1 ring-[#d8d8ff]"
                          : "border-border",
                        isMoving ? "opacity-50" : "hover:shadow-md",
                      ].join(" ")}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          data-testid={`${APPROVALS.checkboxPrefix}-${item.id}`}
                          checked={selected}
                          onChange={() => toggleSelect(item.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-[#2b2bb5] accent-[#2b2bb5]"
                          aria-label={`Select ${item.deliverable_name}`}
                        />

                        <GripVertical
                          className={`mt-0.5 h-4 w-4 shrink-0 text-slate-300 ${
                            isMoving ? "cursor-not-allowed" : "cursor-grab"
                          }`}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {item.project_code}
                          </div>

                          <div className="mt-1 text-sm font-semibold leading-5 text-foreground">
                            {item.deliverable_name}
                          </div>

                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {item.project_name} · {item.client_name || "—"}
                          </div>
                        </div>

                        {item.hidden ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                            <EyeOff className="h-3 w-3" />
                            Hidden
                          </span>
                        ) : (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                            <Clock3 className="h-3 w-3" />
                            Pending
                          </span>
                        )}

                        {renderCardMenu(item)}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                        <span>{item.current_stage}</span>
                        <span>·</span>
                        <span>
                          {(item.required_stages || [item.current_stage]).join(
                            " → "
                          )}
                        </span>
                      </div>

                      {item.comments && (
                        <div className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                          {item.comments}
                        </div>
                      )}

                      <textarea
                        data-testid={`${APPROVALS.notePrefix}-${item.id}`}
                        placeholder="Add a review note..."
                        value={notes[item.id] || ""}
                        onChange={(e) =>
                          setNotes((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        className="mt-3 min-h-[58px] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-[11px] leading-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                        rows={2}
                      />

                      <div className="mt-3 flex gap-2">
                        <button
                          data-testid={`${APPROVALS.approvePrefix}-${item.id}`}
                          onClick={() => decide(item, "approve")}
                          disabled={isMoving}
                          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-[hsl(240_61%_36%)] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve
                        </button>

                        <button
                          data-testid={`${APPROVALS.rejectPrefix}-${item.id}`}
                          onClick={() => decide(item, "reject")}
                          disabled={isMoving}
                          className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-[11px] font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          Send Back
                        </button>
                      </div>
                    </div>
                  );
                })}
              </KanbanColumn>
            );
          })}
        </KanbanBoard>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="bg-[#f7f9fc] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="w-10 px-4 py-3" />
                  <th className="px-3 py-3">Authority</th>
                  <th className="px-3 py-3">Deliverable</th>
                  <th className="px-3 py-3">Project / Client</th>
                  <th className="px-3 py-3">Stage</th>
                  <th className="px-3 py-3">Requested</th>
                  <th className="w-10 px-3 py-3" />
                </tr>
              </thead>

              <tbody>
                {visibleColumns.flatMap((column) =>
                  (filteredBoard[column.key] || []).map((item) => {
                    const selected = selectedIds.has(item.id);

                    return (
                      <tr
                        key={item.id}
                        data-testid={`${APPROVALS.listRowPrefix}-${item.id}`}
                        className={[
                          "border-b border-border last:border-0 transition-colors",
                          selected ? "bg-[#fafaff]" : "hover:bg-[#fafbff]",
                        ].join(" ")}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelect(item.id)}
                            className="h-4 w-4 rounded border-slate-300 text-[#2b2bb5] accent-[#2b2bb5]"
                          />
                        </td>

                        <td className="px-3 py-3 text-xs font-medium text-foreground">
                          {column.label}
                        </td>

                        <td className="px-3 py-3">
                          <div className="font-medium text-foreground">
                            {item.deliverable_name}
                          </div>
                          <div className="font-mono text-[11px] text-muted-foreground">
                            {item.project_code}
                          </div>
                        </td>

                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {item.project_name} · {item.client_name || "—"}
                        </td>

                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {item.current_stage}
                        </td>

                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {item.requested_at
                            ? format(parseISO(item.requested_at), "dd MMM yyyy")
                            : "—"}
                        </td>

                        <td className="px-3 py-3">{renderCardMenu(item)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filteredTotal === 0 && (
            <div
              data-testid={APPROVALS.emptyState}
              className="flex flex-col items-center justify-center px-5 py-16 text-center"
            >
              <p className="text-sm font-semibold text-foreground">
                No approvals match these filters
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}