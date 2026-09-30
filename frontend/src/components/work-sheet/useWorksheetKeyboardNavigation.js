// Every visible cell is a navigation stop: the table cell itself carries
// data-sheet-cell/row/col and tabIndex=-1. Keyboard movement lands on the
// cell's own control (input, dropdown button...) when it has an enabled one,
// and on the cell itself otherwise - a row the user can't edit (admins are
// view-only, members can't edit other people's rows) or a read-only column
// like Creator. Moving only between enabled controls used to stop dead at
// those cells, and blurring into them left focus on <body>, after which no
// arrow key or Tab did anything.
const getSheetCells = () =>
  Array.from(document.querySelectorAll("[data-sheet-cell]"));

const CONTROL_SELECTOR = "input, textarea, button, [role='combobox']";

export const focusCheckboxRow = (row) => {
  const el = document.querySelector(`[data-checkbox-row="${row}"]`);

  if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") {
    return false;
  }

  el.focus();
  return true;
};

const findCell = (row, col) =>
  document.querySelector(
    `[data-sheet-cell][data-sheet-row="${row}"][data-sheet-col="${col}"]`
  );

const isUsable = (el) =>
  !!el && !el.disabled && el.getAttribute("aria-disabled") !== "true";

// The element to focus for a cell: its first enabled control, else the cell.
// A cell marked data-nav-shell (Date) always takes focus itself, so moving
// through it never gets caught in the date input's own arrow-key handling.
const focusTargetFor = (cell) => {
  if (cell.hasAttribute("data-nav-shell")) return cell;
  const control = cell.querySelector(CONTROL_SELECTOR);
  return isUsable(control) ? control : cell;
};

const focusCell = (row, col) => {
  const cell = findCell(row, col);

  if (!cell) return false;

  focusTargetFor(cell).focus();

  return true;
};

// Put focus back on the cell itself (not its control), e.g. after Escape, so
// the cell stays active and the arrow keys keep working.
export const focusCellShell = (row, col) => {
  const cell = findCell(row, col);
  if (!cell) return false;
  cell.focus();
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

  if (!cells.length) return false;

  focusTargetFor(cells[0].element).focus();
  return true;
};

// Tab / Shift+Tab from outside the grid's own key handling - e.g. from a
// dropdown's search box, which lives in a popover portal - to the cell after
// (or before) the one `fromEl` belongs to.
export const focusAdjacentCell = (fromEl, direction) => {
  const cell = fromEl?.closest?.("[data-sheet-cell]");
  if (!cell) return false;
  return focusNextAvailableCell(
    Number(cell.dataset.sheetRow),
    Number(cell.dataset.sheetCol),
    direction
  );
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

    // A date field has three editable segments (day / month / year) and Tab
    // is how the browser moves between them, leaving the field only after
    // the last one. Taking over Tab here jumped straight to the next cell
    // after the day, so month and year could not be reached with Tab.
    if (
      event.key === "Tab" &&
      target instanceof HTMLInputElement &&
      target.type === "date"
    ) {
      return;
    }

    // Keep normal cursor movement while editing text.
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement
    ) {
      if (event.key === "Home" || event.key === "End") {
        return;
      }

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        // Only some input types support selectionStart/selectionEnd —
        // "date" and "number" throw on access instead of returning a
        // value, so treat those as "always native" (their own arrow-key
        // behavior — moving between date segments, nudging a number —
        // matters more than cell nav there).
        const supportsSelection =
          target instanceof HTMLTextAreaElement ||
          !["date", "number"].includes(target.type);

        if (!supportsSelection) {
          return;
        }

        const atStart =
          target.selectionStart === 0 && target.selectionEnd === 0;
        const atEnd =
          target.selectionStart === target.value.length &&
          target.selectionEnd === target.value.length;
        const wantsCellNav =
          (event.key === "ArrowLeft" && atStart) ||
          (event.key === "ArrowRight" && atEnd);

        // Cursor is mid-text (or a range is selected) → let it move/
        // collapse normally instead of jumping to another cell.
        if (!wantsCellNav) {
          return;
        }
        // At the boundary already → fall through to cell navigation
        // below, same as pressing Left/Right on an empty/unfocused cell.
      }

      // A textarea (Remarks) keeps Up/Down for moving between its own lines,
      // and only hands them to the sheet from its first line (Up) or last
      // line (Down). It used to keep them always, so a one-line Remarks
      // cell swallowed Up/Down completely.
      if (
        target instanceof HTMLTextAreaElement &&
        ["ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        const { value, selectionStart, selectionEnd } = target;
        const onFirstLine = !value.slice(0, selectionStart).includes("\n");
        const onLastLine = !value.slice(selectionEnd).includes("\n");
        const leaves =
          (event.key === "ArrowUp" && onFirstLine) ||
          (event.key === "ArrowDown" && onLastLine);

        if (!leaves) {
          return;
        }
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

      const jumpToEdge = event.ctrlKey || event.metaKey;

      if (event.shiftKey) {
        // Shift+Arrow never moves focus (only the highlighted range
        // grows/shrinks), so commit what was typed with a blur and put
        // focus straight back on the same field.
        if (isTextEditable) {
          target.blur();
          target.focus();
        }

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

      // Moving focus blurs the field, which is what commits a typed value.
      // Every rendered cell can take focus, so this only fails when the
      // target row isn't rendered (the sheet is virtualized); focus then
      // stays where it is instead of dropping to <body>.
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

      // Existing rows → move down/up. If there is no row to move to, keep
      // the current cell active rather than leaving focus on <body>.
      const nextRow = event.shiftKey ? row - 1 : row + 1;

      if (nextRow < 1 || !focusCell(nextRow, col)) {
        focusCellShell(row, col);
      }

      return;
    }

    // Escape → leave the field but stay on the cell, so arrows still work.
    if (event.key === "Escape" && target !== findCell(row, col)) {
      focusCellShell(row, col);
    }
  };
};