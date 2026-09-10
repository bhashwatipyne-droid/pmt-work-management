import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import {
  bulkDeleteWorkItems,
  bulkUpdateWorkItems,
  bulkCreateWorkItems,
  createWorkItem,
  deleteWorkItem,
  getOptions,
  getWorkItems,
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
import { History } from "lucide-react";
import { WorkSheetHistory } from "@/components/work-sheet/WorkSheetHistory";
import { toast } from "sonner";
import { WORKSHEET } from "@/constants/testIds";

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
  Finish: "Finish",
};

export default function WorkSheetPage() {
  const { currentUser, currentUserId, users, loading: userLoading } = useUser();
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
      Finish: createFilters(),
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
  const [deleting, setDeleting] = useState(false);
  const bulkAddingRef = useRef(false);
  const addingRowRef = useRef(false);
  const itemsRef = useRef(items);
  const tableRef = useRef(null);
  const isAdmin = currentUser?.role === "admin";
  const isManager = currentUser?.role === "manager";
  const isMember = currentUser?.role === "member";

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

  const fetchItems = () => {
    if (!currentUser) return;
    setLoading(true);

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
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

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
      toast.success("Row added");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not add row");
    } finally {
      addingRowRef.current = false;
      setAddingRow(false);
    }
  };

  const handleQuickLoggerSave = async (payloads) => {
    for (const payload of payloads) {
      await createWorkItem(currentUser.id, payload);
    }

    await fetchItems();
  };

  const handleBulkAddRows = async (count) => {
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
      toast.success(`${created.length} rows added`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not add rows");
    } finally {
      bulkAddingRef.current = false;
      setBulkAdding(false);
    }
  };

  // Wrapped in useCallback so its reference is stable across WorkSheetPage
  // re-renders (which happen on every edit via setItems). Reads the revert
  // snapshot from itemsRef instead of closing over `items`, so `items` can
  // safely stay out of the dependency array.
  const handleUpdate = useCallback(async (id, patch) => {
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
      // Use it as the source of truth once persistence succeeds.
      if (updated) {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? updated : item
          )
        );
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
  }, [currentUser]);

  const handleDelete = async (item) => {
    if (!item?.id) return;

    setDeleting(true);

    try {
      await deleteWorkItem(currentUser.id, item.id);

      setItems((prev) => prev.filter((row) => row.id !== item.id));

      toast.success("Entry deleted");
      setDeleteTarget(null);
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

  const handleBulkStatus = async (status) => {
    try {
      const updated = await bulkUpdateWorkItems(currentUser.id, selectedIds, { status });
      const byId = Object.fromEntries(updated.map((u) => [u.id, u]));
      setItems((prev) => prev.map((it) => byId[it.id] || it));
      toast.success(`Updated ${updated.length} row${updated.length === 1 ? "" : "s"}`);
      setSelectedIds([]);
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

      toast.success(
        `Deleted ${deleted_count} row${deleted_count === 1 ? "" : "s"}`
      );

      setSelectedIds([]);
      setBulkDeleteConfirmOpen(false);
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
    return <div className="flex h-screen items-center justify-center text-slate-500">Loading work sheet...</div>;
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
        canAdd={true}
        resultCount={filteredItems.length}
        onBulkAdd={isAdmin ? undefined : handleBulkAddRows}
        bulkAdding={bulkAdding}
        onOpenQuickLogger={
          isManager || isMember ? () => setQuickLoggerOpen(true) : undefined
        }
        onOpenBulkReview={
          isManager ? () => setBulkReviewOpen(true) : undefined
        }
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
        onClose={() => setBulkReviewOpen(false)}
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
          onDelete={handleBulkDelete}
          onClear={() => setSelectedIds([])}
        />
      )}

      {loading ? (
        <div data-testid={WORKSHEET.loadingState} className="flex flex-1 items-center justify-center text-sm text-slate-500">
          Loading rows...
        </div>
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
    </div>
  );
}