const getSheetCells = () =>
  Array.from(document.querySelectorAll("[data-sheet-cell]"));

export const focusCheckboxRow = (row) => {
  const el = document.querySelector(`[data-checkbox-row="${row}"]`);

  if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") {
    return false;
  }

  el.focus();
  return true;
};

const findCell = (row, col) => {
  return getSheetCells().find(
    (element) =>
      Number(element.dataset.sheetRow) === row &&
      Number(element.dataset.sheetCol) === col
  );
};

const focusCell = (row, col) => {
  const cell = findCell(row, col);

  if (!cell) return false;

  const target =
    cell.querySelector("input, textarea, button, [role='combobox']") || cell;

  if (
    target.disabled ||
    target.getAttribute("aria-disabled") === "true"
  ) {
    return false;
  }

  target.focus();

  return true;
};

const focusNextAvailableCell = (row, col, direction) => {
  const cells = getSheetCells()
    .map((element) => ({
      element,
      row: Number(element.dataset.sheetRow),
      col: Number(element.dataset.sheetCol),
    }))
    .filter((cell) => {
      if (direction > 0) {
        return (
          cell.row > row ||
          (cell.row === row && cell.col > col)
        );
      }

      return (
        cell.row < row ||
        (cell.row === row && cell.col < col)
      );
    })
    .sort((a, b) => {
      if (direction > 0) {
        return a.row - b.row || a.col - b.col;
      }

      return b.row - a.row || b.col - a.col;
    });

  for (const cell of cells) {
    const target =
      cell.element.querySelector(
        "input, textarea, button, [role='combobox']"
      ) || cell.element;

    if (
      !target.disabled &&
      target.getAttribute("aria-disabled") !== "true"
    ) {
      target.focus();
      return true;
    }
  }

  return false;
};

export const createWorksheetKeyHandler = ({
  row,
  col,
  maxCol = 13,
  maxRow = Infinity,
  onEnter,
  onExtendSelection,
}) => {
  const ARROW_DIRECTIONS = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  };

  return async (event) => {
    const target = event.target;

    // Keep normal cursor movement while editing text.
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      if (
        ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
      ) {
        return;
      }

      if (
        target instanceof HTMLTextAreaElement &&
        ["ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        return;
      }
    }

    // Tab → next cell / Shift+Tab → previous cell.
    if (event.key === "Tab") {
      event.preventDefault();

      const direction = event.shiftKey ? -1 : 1;

      focusNextAvailableCell(row, col, direction);

      return;
    }

    // Arrow keys → move the active cell (Google-Sheets style). Left/Right
    // never reach here while text is being edited (exempted above, so the
    // cursor moves within the text instead) — only Up/Down do for a
    // single-line input, which is intentional: there's no native meaning
    // for Up/Down in a one-line field, so it's free to repurpose for
    // cell-to-cell navigation, same as Sheets.
    const direction = ARROW_DIRECTIONS[event.key];
    if (direction) {
      event.preventDefault();

      const isTextEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement;

      // Commit whatever was typed before doing anything else — same
      // reasoning as Enter below: don't rely purely on a focus-shift's
      // side effect to trigger the blur-based commit.
      if (isTextEditable) {
        target.blur();
      }

      const jumpToEdge = event.ctrlKey || event.metaKey;

      if (event.shiftKey) {
        // Shift(+Ctrl)+Arrow — extend/shrink a rectangular selection from
        // the anchor cell (wherever focus currently is) without moving
        // focus itself. Pressing plain arrows afterward collapses it.
        onExtendSelection?.({
          anchorRow: row,
          anchorCol: col,
          direction,
          jumpToEdge,
          maxRow,
          maxCol,
        });
        return;
      }

      let nextRow = row;
      let nextCol = col;

      if (direction === "up") nextRow = jumpToEdge ? 1 : row - 1;
      if (direction === "down") nextRow = jumpToEdge ? maxRow : row + 1;
      if (direction === "left") nextCol = jumpToEdge ? 0 : col - 1;
      if (direction === "right") nextCol = jumpToEdge ? maxCol : col + 1;

      nextRow = Math.max(1, Math.min(maxRow, nextRow));
      nextCol = Math.max(0, Math.min(maxCol, nextCol));

      focusCell(nextRow, nextCol);
      return;
    }

    // Enter.
    if (event.key === "Enter") {
      event.preventDefault();

      // Draft row can provide its own Enter behavior.
      if (onEnter) {
        await onEnter({
          row,
          col,
          focusCell,
        });
        return;
      }

      // Fields commit on blur. Moving focus to the next row's cell
      // normally triggers that blur as a side effect, but focusCell can
      // silently fail to find a target — the next row may not be
      // rendered yet (the sheet is virtualized) or this may be the last
      // row — leaving the typed value sitting uncommitted. Blur the
      // current field explicitly first so Enter always saves what was
      // typed, regardless of whether navigation itself succeeds.
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        target.blur();
      }

      // Existing rows → move down/up.
      const nextRow = event.shiftKey ? row - 1 : row + 1;

      if (nextRow >= 0) {
        focusCell(nextRow, col);
      }

      return;
    }

    // Escape → leave the current field.
    if (event.key === "Escape") {
      target.blur();
    }
  };
};
