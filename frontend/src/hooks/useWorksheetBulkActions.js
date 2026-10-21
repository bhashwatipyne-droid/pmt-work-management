import { toast } from "sonner";
import { trackEvent } from "@/analytics";
import { refreshCounts } from "@/lib/countsBus";
import { bulkDeleteWorkItems, bulkUpdateWorkItems } from "@/services/api";

// The actions on the bar that appears when rows are selected: set a status,
// assign people, and delete (with its confirmation step).
export function useWorksheetBulkActions({
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
}) {
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

  return { handleBulkStatus, handleBulkAssign, handleBulkDelete, confirmBulkDelete };
}
