import { useRef, useState } from "react";
import { toast } from "sonner";
import { trackEvent } from "@/analytics";
import { refreshCounts } from "@/lib/countsBus";
import { DEPARTMENT_TO_STAGE } from "@/lib/worksheetView";
import { bulkCreateWorkItems, createWorkItem } from "@/services/api";

// Everything that adds rows to the Work Sheet: the + button, "add N rows",
// the quick logger, insert above/below, and duplicate (one or the selection).
export function useWorksheetRowCreation({
  currentUser,
  activeSheet,
  canAddToActiveSheet,
  selectedIds,
  setSelectedIds,
  setItems,
  itemsRef,
  sortedItems,
  tableRef,
  revealMonthOf,
  pushUndo,
  removeRows,
}) {
  const [bulkAdding, setBulkAdding] = useState(false);
  const [addingRow, setAddingRow] = useState(false);
  const bulkAddingRef = useRef(false);
  const addingRowRef = useRef(false);

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

  return {
    addingRow,
    bulkAdding,
    handleAddRow,
    handleQuickLoggerSave,
    handleBulkAddRows,
    handleInsertRow,
    handleDuplicateRow,
    handleBulkDuplicate,
  };
}
