import { useEffect, useRef, useState } from "react";
import { useUser } from "@/context/UserContext";
import {
  bulkDeleteWorkItems,
  bulkUpdateWorkItems,
  bulkCreateWorkItems,
  createWorkItem,
  getOptions,
  getWorkItems,
  updateWorkItem,
  getProjects,
  getDeliverables,
} from "@/services/api";
import { WorkSheetToolbar } from "@/components/work-sheet/WorkSheetToolbar";
import { WorkSheetTabs } from "@/components/work-sheet/WorkSheetTabs";
import { WorkSheetTable } from "@/components/work-sheet/WorkSheetTable";
import { BulkActionBar } from "@/components/work-sheet/BulkActionBar";
import { CloseDeliverableModal } from "@/components/work-sheet/CloseDeliverableModal";
import QuickLoggerModal from "../components/work-sheet/QuickLoggerModal";
import BulkReviewModal from "../components/work-sheet/BulkReviewModal";
import { History } from "lucide-react";
import { WorkSheetHistory } from "@/components/work-sheet/WorkSheetHistory";
import { toast } from "sonner";
import { WORKSHEET } from "@/constants/testIds";
import { canEditWorkItem } from "@/lib/worksheetPermissions";

const emptyFilters = { search: "", status: "", deliverable_type: "", work_category: "", month: "" };
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
  const [filters, setFilters] = useState(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [quickLoggerOpen, setQuickLoggerOpen] = useState(false);
  const [bulkReviewOpen, setBulkReviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bulkAddingRef = useRef(false);
  const isAdmin = currentUser?.role === "admin";
  const isManager = currentUser?.role === "manager";

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
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      ...(activeSheet !== "Master" ? { stage: activeSheet } : {}),
    };
    getWorkItems(currentUser.id, params)
      .then(setItems)
      .catch(() => toast.error("Could not load work items"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();
    setSelectedIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, filters, activeSheet]);

  const handleAddRow = async () => {
    try {
      const created = await createWorkItem(currentUser.id, {
        work_date: new Date().toISOString().slice(0, 10),
        deliverable_name: "",
        deliverable_type: options.deliverable_types?.[0] || "",
        work_category: "Core",
        status: "Not Started",
        project_id: localStorage.getItem(LS.project) || null,
        deliverable_id: localStorage.getItem(LS.deliverable) || null,
        stage:
          activeSheet === "Master"
            ? (DEPARTMENT_TO_STAGE[currentUser.department] || null)
            : activeSheet,
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
          : activeSheet;
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

  const handleUpdate = async (id, patch) => {
    const previous = items.find((item) => item.id === id);

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
  };

  const handleFill = async (targetIds, field, value) => {
    if (!targetIds.length || !field) return;

    const previous = items
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
  };

  const toggleSelect = (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  const toggleSelectAll = () => {
    const editableIds = items.filter((it) => canEditWorkItem(currentUser, it, users)).map((it) => it.id);
    setSelectedIds((prev) => (prev.length === editableIds.length ? [] : editableIds));
  };

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

  const handleBulkDelete = async () => {
    try {
      const { deleted_count } = await bulkDeleteWorkItems(currentUser.id, selectedIds);
      setItems((prev) => prev.filter((it) => !selectedIds.includes(it.id)));
      toast.success(`Deleted ${deleted_count} row${deleted_count === 1 ? "" : "s"}`);
      setSelectedIds([]);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Bulk delete failed");
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
        onAddRow={handleAddRow}
        canAdd={false}
        resultCount={items.length}
        onBulkAdd={isAdmin ? undefined : handleBulkAddRows}
        bulkAdding={bulkAdding}
        onOpenCloseDeliverable={
          isManager ? () => setCloseModalOpen(true) : undefined
        }
        onOpenQuickLogger={
          isManager || isAdmin ? () => setQuickLoggerOpen(true) : undefined
        }
        onOpenBulkReview={
          isManager || isAdmin ? () => setBulkReviewOpen(true) : undefined
        }
        onOpenHistory={() => setHistoryOpen(true)}
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
          items={items}
          currentUser={currentUser}
          users={users}
          options={options}
          projects={projects}
          deliverables={deliverables}
          onUpdate={handleUpdate}
          onFill={handleFill}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      )}
    </div>
  );
}