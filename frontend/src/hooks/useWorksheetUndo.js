import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { refreshCounts } from "@/lib/countsBus";
import {
  bulkDeleteWorkItems,
  bulkUpdateWorkItems,
  createWorkItem,
} from "@/services/api";

// Ctrl/Cmd+Z for the Work Sheet: a short stack of "how to put this back"
// steps, plus the helpers the page's edit handlers use to record them
// (snapshotFields before a change, pushUndo after it).
export function useWorksheetUndo({
  currentUser,
  itemsRef,
  setItems,
  setSelectedIds,
  revealMonthOf,
}) {
  const undoStackRef = useRef([]);
  const undoBusyRef = useRef(false);

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

  return {
    pushUndo,
    restoreRows,
    removeRows,
    revertFields,
    snapshotFields,
    runUndo,
    runUndoRef,
  };
}
