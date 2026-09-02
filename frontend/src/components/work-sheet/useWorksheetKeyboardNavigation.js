const getSheetCells = () =>
  Array.from(document.querySelectorAll("[data-sheet-cell]"));

const focusCell = (row, col) => {
  const cell = getSheetCells().find(
    (element) =>
      Number(element.dataset.sheetRow) === row &&
      Number(element.dataset.sheetCol) === col
  );

  if (!cell) return false;

  const target =
    cell.querySelector("input, textarea, button, [role='combobox']") || cell;

  target.focus();

  return true;
};

export const createWorksheetKeyHandler = ({
  row,
  col,
  maxCol = 13,
}) => {
  return (event) => {
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

      // Allow normal vertical cursor movement inside Remarks.
      if (
        target instanceof HTMLTextAreaElement &&
        ["ArrowUp", "ArrowDown"].includes(event.key)
      ) {
        return;
      }
    }

    // Tab → next/previous cell.
    if (event.key === "Tab") {
      event.preventDefault();

      const nextCol = event.shiftKey ? col - 1 : col + 1;

      if (nextCol >= 0 && nextCol <= maxCol) {
        focusCell(row, nextCol);
      }

      return;
    }

    // Enter → same column, next/previous row.
    if (event.key === "Enter") {
      event.preventDefault();

      const nextRow = event.shiftKey ? row - 1 : row + 1;

      if (nextRow >= 0) {
        focusCell(nextRow, col);
      }

      return;
    }

    // Escape → leave the current cell.
    if (event.key === "Escape") {
      target.blur();
    }
  };
};