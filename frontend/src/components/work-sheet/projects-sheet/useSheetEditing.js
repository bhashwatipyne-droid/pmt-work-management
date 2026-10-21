import { COLS, DATE_FIELD, TEXT_FIELD } from "@/components/work-sheet/projects-sheet/sheetColumns";
import { isPrintable } from "@/components/work-sheet/projects-sheet/sheetDates";
import { toast } from "sonner";
import { useEffect } from "react";

export function useSheetEditing({ canEdit, cell, clearBlock, colIndex, cols, copyBlock, editing, flatRows, gridRef, isMulti, lastSelRef, menu, noteFor, pendingEditRef, rangeEnd, save, saveNote, setCell, setEditing, setMenu, setRangeEnd, setSel, taskById, undo }) {
  // The raw value a cell edits (not what it shows).
  const editValue = (t, key) => {
    if (TEXT_FIELD[key]) return t[TEXT_FIELD[key]] || "";
    if (DATE_FIELD[key]) return t[DATE_FIELD[key]] || "";
    if (key === "count") return t.deliverable_count == null ? "" : String(t.deliverable_count);
    if (key === "remark") return noteFor(t.id);
    return "";
  };

  const commitText = (t, key, text) => {
    const value = (text ?? "").trim();
    if (value === editValue(t, key).trim()) return;
    if (TEXT_FIELD[key]) save(t, { [TEXT_FIELD[key]]: value });
    else if (key === "remark") saveNote(t, value);
    else if (key === "count") {
      if (value && !/^\d+$/.test(value)) {
        toast.error("Deliverables must be a whole number");
        return;
      }
      save(t, { deliverable_count: value ? Number(value) : null });
    } else if (DATE_FIELD[key]) {
      if (key === "date" && !value) {
        toast.error("A task needs a date");
        return;
      }
      save(t, { [DATE_FIELD[key]]: value || null });
    }
  };

  const focusGrid = () => gridRef.current?.focus({ preventScroll: true });

  const moveCell = (dr, dc) => {
    if (!cell) return;
    const ri = flatRows.findIndex((t) => t.id === cell.r);
    const ci = cols.findIndex((c) => c.key === cell.c);
    const nr = flatRows[Math.max(0, Math.min(flatRows.length - 1, ri + dr))];
    const nc = cols[Math.max(0, Math.min(cols.length - 1, ci + dc))];
    if (nr && nc) setCell({ r: nr.id, c: nc.key });
    setRangeEnd(null);
  };

  // Enter / double click on a cell: type in it, or open its picker.
  const startEdit = (taskId, key, initial) => {
    const col = COLS.find((c) => c.key === key);
    const t = taskById.get(taskId);
    if (!t || !canEdit || col.kind === "ro") return;
    setCell({ r: taskId, c: key });
    if (col.kind === "date") {
      requestAnimationFrame(() => document.querySelector(`[data-cell="${taskId}:${key}"] input`)?.focus());
      return;
    }
    if (["text", "number"].includes(col.kind)) {
      setEditing({ r: taskId, c: key, draft: initial ?? editValue(t, key) });
    } else {
      setMenu({ r: taskId, c: key, kind: "pick" });
    }
  };

  const finishEdit = (save_, move) => {
    if (!editing) return;
    const t = taskById.get(editing.r);
    if (save_ && t) commitText(t, editing.c, editing.draft);
    setEditing(null);
    if (move === "down") moveCell(1, 0);
    else if (move === "up") moveCell(-1, 0);
    else if (move === "right") moveCell(0, 1);
    else if (move === "left") moveCell(0, -1);
    requestAnimationFrame(focusGrid);
  };

  // Keep the selected cell in view.
  useEffect(() => {
    if (!cell) return;
    const el = gridRef.current?.querySelector(`[data-cell="${cell.r}:${cell.c}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell]);

  // A new row opens straight into its Task cell.
  useEffect(() => {
    const id = pendingEditRef.current;
    if (id && taskById.get(id)) {
      pendingEditRef.current = null;
      setCell({ r: id, c: "task" });
      setEditing({ r: id, c: "task", draft: "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskById]);

  const onGridKey = (e) => {
    // Only keys pressed on the sheet itself (not in a menu opened from it).
    if (e.target !== e.currentTarget || editing || menu || !cell) return;
    const t = taskById.get(cell.r);
    const col = COLS.find((c) => c.key === cell.c);
    const moves = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "c") {
      e.preventDefault();
      copyBlock();
      return;
    }
    if (mod && e.key.toLowerCase() === "z" && canEdit) {
      e.preventDefault();
      undo();
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const r = mod ? flatRows[e.key === "Home" ? 0 : flatRows.length - 1] : taskById.get(cell.r);
      const c = cols[e.key === "Home" ? 0 : cols.length - 1];
      if (r && c) setCell({ r: r.id, c: c.key });
      setRangeEnd(null);
      return;
    }
    if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      // Shift+Left / Shift+Right widen the block of selected cells.
      e.preventDefault();
      const end = rangeEnd || cell;
      const ci = colIndex(end.c) + (e.key === "ArrowRight" ? 1 : -1);
      if (cols[ci]) setRangeEnd({ r: end.r, c: cols[ci].key });
      return;
    }
    if (e.shiftKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      // Shift+Down / Shift+Up selects rows, like Shift+click on the checkboxes.
      e.preventDefault();
      const ri = flatRows.findIndex((x) => x.id === cell.r);
      const next = flatRows[ri + (e.key === "ArrowDown" ? 1 : -1)];
      setSel((cur) => ({ ...cur, [cell.r]: true, ...(next ? { [next.id]: true } : {}) }));
      lastSelRef.current = next ? next.id : cell.r;
      if (next) setCell({ r: next.id, c: cell.c });
    } else if (moves[e.key]) {
      e.preventDefault();
      moveCell(...moves[e.key]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      moveCell(0, e.shiftKey ? -1 : 1);
    } else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && col.long) setMenu({ r: cell.r, c: cell.c, kind: "expand" });
      else startEdit(cell.r, cell.c);
    } else if (e.key === "Escape") {
      if (rangeEnd) setRangeEnd(null);
      else setCell(null);
    } else if ((e.key === "Delete" || e.key === "Backspace") && canEdit && t && isMulti) {
      e.preventDefault();
      clearBlock();
    } else if ((e.key === "Delete" || e.key === "Backspace") && canEdit && t) {
      if (["text", "number"].includes(col.kind) || (col.kind === "date" && col.key !== "date")) {
        e.preventDefault();
        commitText(t, col.key, "");
      }
    } else if (isPrintable(e) && canEdit && ["text", "number"].includes(col.kind)) {
      e.preventDefault();
      startEdit(cell.r, cell.c, e.key);
    }
  };


  return { editValue, commitText, focusGrid, moveCell, startEdit, finishEdit, onGridKey };
}
