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
  getProjects,
  getDeliverables,
} from "@/services/api";
import { WorkSheetToolbar } from "@/components/work-sheet/WorkSheetToolbar";
import { WorkSheetTabs } from "@/components/work-sheet/WorkSheetTabs";
import { WorkSheetTable } from "@/components/work-sheet/WorkSheetTable";
import { WorksheetFilterPanel } from "@/components/work-sheet/WorksheetFilterPanel";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { BulkActionBar } from "@/components/work-sheet/BulkActionBar";
import { CloseDeliverableModal } from "@/components/work-sheet/CloseDeliverableModal";
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
const LS = { project: "ws_last_project_id", deliverable: "ws_last_deliverable_id", stage: "ws_last_stage" };
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
  const [projects, setProjects] = useState([]);
  const [deliverables, setDeliverables] = useState([]);
  // Filters are scoped to each worksheet tab. A filter applied on Master
  // should not leak into Content, Design, Animation, or Finish.
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
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [quickLoggerOpen, setQuickLoggerOpen] = useState(false);
  const [bulkReviewOpen, setBulkReviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const bulkAddingRef = useRef(false);
  const itemsRef = useRef(items);
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
    Promise.all([getProjects(currentUserId), getDeliverables(currentUserId)])
      .then(([p, d]) => { setProjects(p); setDeliverables(d); })
      .catch(() => {});
  }, [currentUserId]);

  const fetchItems = () => {
    if (!currentUser) return;
    setLoading(true);

    const params = {
      search: filters.search || undefined,
      month: filters.month || undefined,

      date_from: filters.date_from || undefined,
      date_to: filters.date_to || undefined,

      project_id: filters.project_ids?.length
        ? filters.project_ids
        : undefined,

      deliverable_id: filters.deliverable_ids?.length
        ? filters.deliverable_ids
        : undefined,

      // Master can use the Stage filter. Department sheets are hard-scoped
      // to their own stage and ignore any Stage selection from the filter panel.
      stage:
        activeSheet === "Master"
          ? (filters.stages?.length ? filters.stages : undefined)
          : [DEPARTMENT_TO_STAGE[activeSheet] || activeSheet],

      deliverable_type: filters.deliverable_types?.length
        ? filters.deliverable_types
        : undefined,

      work_category: filters.work_categories?.length
        ? filters.work_categories
        : undefined,

      creator_id: filters.creator_ids?.length
        ? filters.creator_ids
        : undefined,

      reviewer_id: filters.reviewer_ids?.length
        ? filters.reviewer_ids
        : undefined,

      status: filters.statuses?.length
        ? filters.statuses
        : undefined,
    };

    getWorkItems(currentUser.id, params)
      .then((data) => {
        const rows = Array.isArray(data) ? data : [];
        const sheetStage =
          activeSheet === "Master"
            ? null
            : DEPARTMENT_TO_STAGE[activeSheet] || activeSheet;
        const selectedStages =
          activeSheet === "Master" && filters.stages?.length
            ? new Set(
                filters.stages.map((stage) =>
                  String(stage).trim().toLowerCase()
                )
              )
            : null;

        // Defensive client-side guard. Department sheets are always restricted
        // to their own stage. On Master, an explicitly selected Stage filter is
        // also enforced locally so the table cannot show rows outside the filter
        // even if an API/deployment returns an unfiltered response.
        setItems(
          sheetStage
            ? rows.filter(
                (item) =>
                  String(item.stage || "").trim().toLowerCase() ===
                  sheetStage.trim().toLowerCase()
              )
            : selectedStages
              ? rows.filter((item) =>
                  selectedStages.has(
                    String(item.stage || "").trim().toLowerCase()
                  )
                )
              : rows
        );
      })
      .catch(() => toast.error("Could not load work items"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();
    setSelectedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, filters, activeSheet]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const dateA = a.work_date || "";
      const dateB = b.work_date || "";

      return sortDirection === "desc"
        ? dateB.localeCompare(dateA)
        : dateA.localeCompare(dateB);
    });
  }, [items, sortDirection]);

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
    try {
      const defaultType = options.deliverable_types?.[0] || "";
      const created = await createWorkItem(currentUser.id, {
        work_date: new Date().toISOString().slice(0, 10),
        deliverable_name: "",
        deliverable_type: defaultType,
        work_category:
          options.deliverable_type_categories?.[defaultType] || "",
        creator_id: currentUser.id,
        status: "Not Started",
        project_id: localStorage.getItem(LS.project) || null,
        deliverable_id: localStorage.getItem(LS.deliverable) || null,
        stage:
          activeSheet === "Master"
            ? (DEPARTMENT_TO_STAGE[currentUser.department] || null)
            : (DEPARTMENT_TO_STAGE[activeSheet] || activeSheet),
      });
      setItems((prev) => [...prev, created]);
      toast.success("Row added");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not add row");
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

    // Optimistic update — exactly one React state update.
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
      await updateWorkItem(currentUser.id, id, patch);
    } catch (e) {
      // Revert only this row if persistence fails.
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
  const handleHideRows = () => {
    if (!selectedIds.length) return;

    setHiddenRows((current) => [
      ...new Set([...current, ...selectedIds]),
    ]);

    setSelectedIds([]);
  };
  const toggleSelectAll = () => {
    const visibleIds = items.map((item) => item.id);

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

  if (userLoading || !currentUser) {
    return <div className="flex h-screen items-center justify-center text-slate-500">Loading work sheet...</div>;
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <WorkSheetToolbar
        filters={filters}
        setFilters={setFilters}
        options={options}
        onOpenFilters={() => setFiltersOpen(true)}
        activeFilterCount={activeFilterCount}
        onAddRow={handleAddRow}
        canAdd={false}
        resultCount={items.length}
        onBulkAdd={isAdmin ? undefined : handleBulkAddRows}
        bulkAdding={bulkAdding}
        onOpenCloseDeliverable={
          isManager ? () => setCloseModalOpen(true) : undefined
        }
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

      {isManager && (
        <CloseDeliverableModal
          open={closeModalOpen}
          onClose={() => setCloseModalOpen(false)}
          currentUserId={currentUser.id}
          projects={projects}
          deliverables={deliverables}
          onClosed={() => {
            getDeliverables(currentUserId).then(setDeliverables).catch(() => {});
          }}
        />
      )}

      <QuickLoggerModal
        open={quickLoggerOpen}
        onClose={() => setQuickLoggerOpen(false)}
        currentUser={currentUser}
        projects={projects}
        deliverables={deliverables}
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
          items={sortedItems}
          currentUser={currentUser}
          users={users}
          options={options}
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
          onOpenFilters={() => setFiltersOpen(true)}
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