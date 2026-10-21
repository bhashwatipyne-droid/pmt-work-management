import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { trackEvent } from "@/analytics";

// Selecting a block of cells on the Work Sheet: copy / paste of the block
// (Ctrl/Cmd+C, Ctrl/Cmd+V), drag and Shift+click to grow it, Esc to clear it.
export function useWorksheetRangeSelection({
  activeCellRef,
  canEditItem,
  copyBlock,
  headerHeight,
  onUpdate,
  qtyPanelRef,
  rangeDragRef,
  rangeSelectionRef,
  resolvePasteValue,
  scrollRef,
  setRangeSelection,
  sortedItemsRef,
  suppressClickRef,
  visibleColumns
}) {
  const clearRangeSelection = useCallback(() => {
    rangeSelectionRef.current = null;
    setRangeSelection(null);
  }, []);

  // Ctrl/Cmd+C copies the active cell or, if a Shift+Arrow range is
  // selected, the whole rectangle — as tab/newline-separated text, so it
  // also pastes cleanly into Excel/Sheets/a text editor. Ctrl/Cmd+V does
  // the reverse: parses clipboard text the same way and writes each cell
  // back through onUpdate, resolving names back to IDs per column (e.g.
  // pasting "Ongoing" into Status, or a project name matched against the
  // target row's own client).
  useEffect(() => {
    const isWithinSheet = (el) => !!el?.closest?.("[data-sheet-cell]");

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const isCopy = (event.ctrlKey || event.metaKey) && key === "c";
      const isPaste = (event.ctrlKey || event.metaKey) && key === "v";
      if (!isCopy && !isPaste) return;

      const target = event.target;

      // Inside a text field with its own text actually selected, let the
      // browser's normal text copy/paste happen instead of hijacking it.
      if (
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement) &&
        target.selectionStart !== target.selectionEnd
      ) {
        return;
      }

      if (!isWithinSheet(document.activeElement)) return;

      if (!navigator.clipboard) {
        toast.error(
          "Clipboard access isn't available here (needs HTTPS or a supported browser)"
        );
        return;
      }

      // Read the anchor cell straight off whatever DOM element actually
      // has focus right now, rather than trusting activeCellRef to have
      // stayed perfectly in sync with it. A ref that mirrors focus state
      // can drift stale (state updates and DOM focus don't always land
      // in the same tick); the focused element's own data-sheet-row/col
      // attributes can't be stale — they describe exactly what's focused
      // at this exact moment, which is what paste should target.
      const focusedCellEl = document.activeElement?.closest?.(
        "[data-sheet-cell]"
      );
      const domRow = focusedCellEl
        ? Number(focusedCellEl.getAttribute("data-sheet-row"))
        : null;
      const domCol = focusedCellEl
        ? Number(focusedCellEl.getAttribute("data-sheet-col"))
        : null;
      const domAnchor =
        Number.isFinite(domRow) && Number.isFinite(domCol)
          ? { row: domRow, col: domCol }
          : null;

      const rawRange = rangeSelectionRef.current;

      // A range selection can only still be "live" if whatever's
      // currently focused is actually inside it. If the DOM says focus
      // is on a cell outside that range, the range is a leftover from
      // an earlier, unrelated interaction (e.g. a prior Shift+Arrow
      // session) that never got cleared on every path — trust the fresh
      // click over it rather than silently pasting into stale
      // coordinates.
      const rangeContainsDomAnchor =
        rawRange &&
        domAnchor &&
        domAnchor.row >= Math.min(rawRange.anchorRow, rawRange.row) &&
        domAnchor.row <= Math.max(rawRange.anchorRow, rawRange.row) &&
        domAnchor.col >= Math.min(rawRange.anchorCol, rawRange.col) &&
        domAnchor.col <= Math.max(rawRange.anchorCol, rawRange.col);

      const range = !domAnchor || rangeContainsDomAnchor ? rawRange : null;
      const anchor = domAnchor || activeCellRef.current;
      if (!range && !anchor) return;

      // eslint-disable-next-line no-console
      console.log("[worksheet paste] anchor detection:", {
        domAnchor,
        activeCellRefCurrent: activeCellRef.current,
        rawRange,
        rangeContainsDomAnchor,
        usingRange: range,
        usingAnchor: anchor,
      });

      const startRow = range ? Math.min(range.anchorRow, range.row) : anchor.row;
      const endRow = range ? Math.max(range.anchorRow, range.row) : anchor.row;
      const startCol = range ? Math.min(range.anchorCol, range.col) : anchor.col;
      const endCol = range ? Math.max(range.anchorCol, range.col) : anchor.col;

      if (isCopy) {
        event.preventDefault();
        copyBlock(startRow, endRow, startCol, endCol);
        return;
      }

      // Paste.
      event.preventDefault();

      navigator.clipboard
        .readText()
        .then(async (clipboardText) => {
          if (!clipboardText) return;

          const pastedRows = clipboardText.replace(/\r/g, "").split("\n");
          const pastedGrid = pastedRows.map((line) => line.split("\t"));
          const isSingleValue =
            pastedGrid.length === 1 && pastedGrid[0].length === 1;

          // A single copied value pasted onto a multi-cell range fills
          // the whole range with it (same as Sheets); otherwise the
          // pasted block is stamped once, anchored at the range/active
          // cell's top-left corner, clamped to the sheet's bounds.
          const targetRowCount = isSingleValue
            ? endRow - startRow + 1
            : pastedGrid.length;
          const targetColCount = isSingleValue
            ? endCol - startCol + 1
            : pastedGrid[0].length;

          const maxRow = sortedItemsRef.current.length;
          const maxCol = visibleColumns.length - 1;

          let applied = 0;
          let skipped = 0;

          const targetedRows = [];

          for (let r = 0; r < targetRowCount; r++) {
            const targetRow = startRow + r;
            if (targetRow > maxRow) break;

            const targetItem = sortedItemsRef.current[targetRow - 1];
            if (!targetItem || !canEditItem(targetItem)) {
              skipped += targetColCount;
              continue;
            }

            const updates = {};
            let rowHasUpdate = false;

            for (let c = 0; c < targetColCount; c++) {
              const targetCol = startCol + c;
              if (targetCol > maxCol) break;

              const column = visibleColumns[targetCol];
              const text = isSingleValue
                ? pastedGrid[0][0]
                : pastedGrid[r % pastedGrid.length][c % pastedGrid[0].length];

              const resolved = column
                ? resolvePasteValue(column, text, targetItem)
                : null;

              if (!resolved) {
                skipped += 1;
                continue;
              }

              Object.assign(updates, resolved);
              rowHasUpdate = true;
            }

            if (rowHasUpdate) {
              // IMPORTANT:
              // Wait for the API/MongoDB update before counting
              // this row as successfully pasted.
              const result = await onUpdate(targetItem.id, updates);

              if (result?.success) {
                applied += 1;
                targetedRows.push(targetRow);
              } else {
                skipped += Object.keys(updates).length;
              }
            }
          }

          if (applied > 0) {
            trackEvent("copy_paste_used", {
              action: "paste",
              rows_updated: applied,
              cells_skipped: skipped,
            });
          }

          if (applied === 0) {
            toast.error("Nothing pasted — no changes were saved");
          } else if (skipped > 0) {
            toast.success(`Pasted into row ${targetedRows.join(", ")} — skipped ${skipped} cell${skipped === 1 ? "" : "s"} that couldn't be saved`);
          } else {
            toast.success(`Pasted into row ${targetedRows.join(", ")}`);
          }
        })
        .catch(() => {
          toast.error("Couldn't paste — clipboard access was blocked");
        });
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visibleColumns, copyBlock, resolvePasteValue, canEditItem, onUpdate]);

  // ----- Selecting a block of cells with the mouse -----------------------
  // Drag across cells, or Shift+click a second cell. (Shift+Arrow is handled
  // above.) The cells hold controls - inputs, dropdowns - so the drag is only
  // treated as a selection once the pointer reaches a DIFFERENT cell; a click
  // or a drag inside one cell works exactly as before.
  const cellAtPoint = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest?.("[data-sheet-cell]");
    if (!el) return null;
    const row = Number(el.getAttribute("data-sheet-row"));
    const col = Number(el.getAttribute("data-sheet-col"));
    return Number.isFinite(row) && Number.isFinite(col) ? { row, col } : null;
  };

  const setRangeTo = (anchor, target) => {
    const next = {
      anchorRow: anchor.row,
      anchorCol: anchor.col,
      row: target.row,
      col: target.col,
    };
    const current = rangeSelectionRef.current;
    if (
      current &&
      current.anchorRow === next.anchorRow &&
      current.anchorCol === next.anchorCol &&
      current.row === next.row &&
      current.col === next.col
    ) {
      return;
    }
    rangeSelectionRef.current = next;
    setRangeSelection(next);
  };

  const handleSheetPointerDownCapture = (event) => {
    if (event.button !== 0) return;
    if (event.target.closest?.(".sheet-fill-handle")) return;
    const cell = event.target.closest?.("[data-sheet-cell]");
    if (!cell) return;
    const row = Number(cell.getAttribute("data-sheet-row"));
    const col = Number(cell.getAttribute("data-sheet-col"));
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;

    const current = rangeSelectionRef.current;

    // Shift+click: grow the block from the anchor to the clicked cell.
    if (event.shiftKey) {
      const anchor = current
        ? { row: current.anchorRow, col: current.anchorCol }
        : activeCellRef.current;
      if (anchor) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
        setRangeTo(anchor, { row, col });
        return;
      }
    }

    // A plain click starts over (it used to be left to the cell's own focus
    // handler, which keeps the block when the click lands on its anchor).
    if (current) clearRangeSelection();

    const start = { row, col };
    const drag = { start, active: false, x: event.clientX, y: event.clientY, frame: null };
    rangeDragRef.current = drag;

    const scroller = scrollRef.current;
    const autoScroll = () => {
      drag.frame = null;
      if (!drag.active || !scroller) return;
      const rect = scroller.getBoundingClientRect();
      const edge = 48;
      let dx = 0;
      let dy = 0;
      if (drag.y > rect.bottom - edge) dy = Math.min(28, (drag.y - (rect.bottom - edge)) / 2 + 4);
      else if (drag.y < rect.top + headerHeight + edge / 2) dy = -Math.min(28, (rect.top + headerHeight + edge / 2 - drag.y) / 2 + 4);
      if (drag.x > rect.right - edge) dx = Math.min(28, (drag.x - (rect.right - edge)) / 2 + 4);
      else if (drag.x < rect.left + edge) dx = -Math.min(28, (rect.left + edge - drag.x) / 2 + 4);
      if (dx || dy) {
        scroller.scrollBy(dx, dy);
        const target = cellAtPoint(drag.x, drag.y);
        if (target) setRangeTo(start, target);
        drag.frame = requestAnimationFrame(autoScroll);
      }
    };

    const onMove = (moveEvent) => {
      drag.x = moveEvent.clientX;
      drag.y = moveEvent.clientY;
      const target = cellAtPoint(drag.x, drag.y);

      if (!drag.active) {
        if (!target || (target.row === start.row && target.col === start.col)) return;
        drag.active = true;
        // A dropdown that opened on the press must not stay open under the block.
        if (
          document.querySelector(
            '[data-sheet-cell] [aria-expanded="true"]:not([aria-haspopup="dialog"])'
          )
        ) {
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        }
        document.body.style.userSelect = "none";
        window.getSelection?.()?.removeAllRanges();
      }

      if (target) setRangeTo(start, target);
      if (drag.frame == null) drag.frame = requestAnimationFrame(autoScroll);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (drag.frame != null) cancelAnimationFrame(drag.frame);
      document.body.style.userSelect = "";
      if (drag.active) {
        // The click that ends a drag must not open whatever it ended on.
        suppressClickRef.current = true;
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
      rangeDragRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const handleSheetClickCapture = (event) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
  };

  // Esc clears the block first (a second Esc then behaves as before).
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!rangeSelectionRef.current || qtyPanelRef.current) return;
      if (
        event.target?.closest?.(
          '[role="dialog"], [role="listbox"], [role="menu"], [data-radix-popper-content-wrapper]'
        )
      ) {
        return;
      }
      clearRangeSelection();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clearRangeSelection]);

  return { clearRangeSelection, handleSheetPointerDownCapture, handleSheetClickCapture };
}
