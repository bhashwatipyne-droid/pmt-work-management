const getSheetCells = () =>
  Array.from(document.querySelectorAll("[data-sheet-cell]"));

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
  onEnter,
}) => {
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