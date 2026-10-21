import { useCallback } from "react";
import { toast } from "sonner";

// Mouse work on the Work Sheet table: resizing a column, dragging a column or
// rows to reorder them, and dragging down the checkboxes to select a run.
export function useWorksheetTableDragging({
  canEditItem,
  checkboxAnchorRef,
  checkboxDragRef,
  columnOrderRef,
  columnSort,
  draggedColumn,
  draggedRow,
  draggedRowIds,
  groupBySafe,
  onSelectRange,
  onUndoable,
  rangeSelectionRef,
  resizeStateRef,
  resolveGroupKey,
  rowOrderRef,
  selectedIds,
  selectedSet,
  setActiveCell,
  setColumnOrder,
  setColumnWidths,
  setDraggedColumn,
  setDraggedRow,
  setDraggedRowIds,
  setDropTarget,
  setRangeSelection,
  setResizingColumn,
  setRowOrder,
  setSelection,
  sortedItemsRef
}) {
  const handleColumnResizeStart = useCallback(
    (event, column) => {
      event.preventDefault();
      event.stopPropagation();

      const header = event.currentTarget.parentElement;

      if (!header) return;

      const startWidth = header.getBoundingClientRect().width;

      resizeStateRef.current = {
        column,
        startX: event.clientX,
        startWidth,
      };

      setResizingColumn(column);

      const handleMouseMove = (moveEvent) => {
        const state = resizeStateRef.current;

        if (!state) return;

        const delta = moveEvent.clientX - state.startX;

        const nextWidth = Math.max(
          80,
          Math.round(state.startWidth + delta)
        );

        setColumnWidths((current) => ({
          ...current,
          [state.column]: `${nextWidth}px`,
        }));
      };

      const handleMouseUp = () => {
        resizeStateRef.current = null;
        setResizingColumn(null);

        document.removeEventListener(
          "mousemove",
          handleMouseMove
        );

        document.removeEventListener(
          "mouseup",
          handleMouseUp
        );
      };

      document.addEventListener(
        "mousemove",
        handleMouseMove
      );

      document.addEventListener(
        "mouseup",
        handleMouseUp
      );
    },
    []
  );

  const handleColumnDrop = (targetColumn) => {
    if (!draggedColumn || draggedColumn === targetColumn) return;

    const columnsBefore = columnOrderRef.current;
    onUndoable?.("column move", () => setColumnOrder(columnsBefore));

    setColumnOrder((current) => {
      const next = [...current];
      const fromIndex = next.indexOf(draggedColumn);
      const toIndex = next.indexOf(targetColumn);
      if (fromIndex === -1 || toIndex === -1) return current;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, draggedColumn);
      return next;
    });
    setActiveCell(null);
    setSelection(null);
    setDraggedColumn(null);
  };

  // Rows being dragged: if the picked-up row is one of several selected rows
  // they all travel together (in sheet order); otherwise just that row.
  const handleRowDragStart = (event, rowId) => {
    const ids =
      selectedSet.has(rowId) && selectedSet.size > 1
        ? sortedItemsRef.current
            .filter((item) => selectedSet.has(item.id))
            .map((item) => item.id)
        : [rowId];

    event.dataTransfer.effectAllowed = "move";
    // Firefox only starts a drag that carries some data.
    event.dataTransfer.setData("text/plain", ids.join(","));

    if (ids.length > 1) {
      const ghost = document.createElement("div");
      ghost.textContent = `${ids.length} rows`;
      ghost.style.cssText =
        "position:fixed;top:-1000px;left:-1000px;padding:6px 12px;border-radius:9999px;background:#2b2bb5;color:#fff;font:600 12px system-ui,sans-serif;white-space:nowrap";
      document.body.appendChild(ghost);
      event.dataTransfer.setDragImage(ghost, 16, 16);
      setTimeout(() => ghost.remove(), 0);
    }

    setDraggedRow(rowId);
    setDraggedRowIds(ids);
  };

  const clearRowDrag = () => {
    setDraggedRow(null);
    setDraggedRowIds([]);
    setDropTarget(null);
  };

  // Where, if anywhere, the dragged rows may be dropped relative to `rowId`.
  // Not onto themselves, not while a column sort decides the order, and when
  // the sheet is grouped only within one group (moving rows between groups
  // would mean changing their stage or owner, which a drag should not do).
  const getRowDropPosition = (event, rowId) => {
    if (!draggedRow || columnSort.key || draggedRowIds.includes(rowId)) {
      return null;
    }

    if (groupBySafe) {
      const byId = new Map(sortedItemsRef.current.map((item) => [item.id, item]));
      const targetItem = byId.get(rowId);
      if (!targetItem) return null;
      const targetKey = resolveGroupKey(targetItem);
      const sameGroup = draggedRowIds.every((id) => {
        const item = byId.get(id);
        return item && resolveGroupKey(item) === targetKey;
      });
      if (!sameGroup) return null;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
  };

  const handleRowDragOver = (event, rowId) => {
    const pos = getRowDropPosition(event, rowId);

    if (!pos) {
      if (draggedRow) event.dataTransfer.dropEffect = "none";
      setDropTarget((current) => (current ? null : current));
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget((current) =>
      current && current.id === rowId && current.pos === pos
        ? current
        : { id: rowId, pos }
    );
  };

  const handleRowDrop = (event, targetId) => {
    const pos = getRowDropPosition(event, targetId);
    const ids = draggedRowIds;

    if (!pos || !ids.length) {
      clearRowDrag();
      return;
    }

    const moving = new Set(ids);

    const rowsBefore = rowOrderRef.current;
    onUndoable?.(ids.length === 1 ? "row move" : `move of ${ids.length} rows`, () =>
      setRowOrder(rowsBefore)
    );

    setRowOrder((current) => {
      if (!current.includes(targetId)) return current;
      const carried = current.filter((id) => moving.has(id));
      if (!carried.length) return current;
      const rest = current.filter((id) => !moving.has(id));
      const at = rest.indexOf(targetId) + (pos === "after" ? 1 : 0);
      return [...rest.slice(0, at), ...carried, ...rest.slice(at)];
    });
    setActiveCell(null);
    setSelection(null);
    clearRowDrag();
    toast.success(ids.length === 1 ? "Row moved" : `${ids.length} rows moved`);
  };

  // Press on a row's checkbox and drag down or up over the others to select
  // them all (or, starting on a selected row, to deselect them). A plain click
  // is left to the checkbox itself.
  const handleCheckboxDragStart = (event, id, index) => {
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) {
      return;
    }

    checkboxDragRef.current = {
      startIndex: index,
      on: !selectedSet.has(id),
      base: selectedIds,
      moved: false,
    };

    const stop = () => {
      window.removeEventListener("mouseup", stop);
      document.body.style.userSelect = "";
      // The click that follows the mouseup is still to come; clear after it.
      setTimeout(() => {
        checkboxDragRef.current = null;
      }, 0);
    };
    window.addEventListener("mouseup", stop);
  };

  const handleCheckboxDragEnter = (index) => {
    const drag = checkboxDragRef.current;
    if (!drag || (!drag.moved && index === drag.startIndex)) return;

    if (!drag.moved) {
      drag.moved = true;
      document.body.style.userSelect = "none";
      checkboxAnchorRef.current = drag.startIndex;
      rangeSelectionRef.current = null;
      setRangeSelection(null);
    }

    const start = Math.min(drag.startIndex, index);
    const end = Math.max(drag.startIndex, index);
    const inRange = sortedItemsRef.current
      .slice(start - 1, end)
      .filter((item) => canEditItem(item))
      .map((item) => item.id);

    if (drag.on) {
      onSelectRange?.([...new Set([...drag.base, ...inRange])]);
    } else {
      const removed = new Set(inRange);
      onSelectRange?.(drag.base.filter((id) => !removed.has(id)));
    }
  };

  // A drag across checkboxes already changed the selection; the click that
  // ends it must not toggle the row it started on a second time.
  const handleCheckboxClickCapture = (event) => {
    if (checkboxDragRef.current?.moved) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  return {
    handleColumnResizeStart,
    handleColumnDrop,
    handleRowDragStart,
    clearRowDrag,
    getRowDropPosition,
    handleRowDragOver,
    handleRowDrop,
    handleCheckboxDragStart,
    handleCheckboxDragEnter,
    handleCheckboxClickCapture,
  };
}
