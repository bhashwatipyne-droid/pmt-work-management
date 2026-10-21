import { useCallback } from "react";
import { toast } from "sonner";
import { trackEvent } from "@/analytics";
import { refreshCounts } from "@/lib/countsBus";
import { bulkUpdateWorkItems, deleteWorkItem, updateWorkItem } from "@/services/api";
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
import { LS, trackWorksheetContext } from "@/lib/worksheetView";

// Saving a single cell edit, deleting one entry and filling a range of cells,
// each with its optimistic update, validation and undo entry.
export function useWorksheetItemActions({ currentUser, options, itemsRef, setItems, pushUndo, restoreRows, revertFields, runUndoRef, updateRef, setDeleting, setDeleteTarget }) {
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

  return {
    handleUpdate,
    handleDelete,
    handleFill,
  };
}
