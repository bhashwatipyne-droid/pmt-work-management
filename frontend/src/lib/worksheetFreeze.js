// Frozen Work Sheet columns: "freeze up to this column" keeps that column and
// every one before it in place while the sheet scrolls sideways, like a
// spreadsheet. Shared by the table (header) and the rows (cells) so both pin
// to the same spot.
import {
  CHECKBOX_WIDTH,
  COLUMN_WIDTHS,
  ROW_NUM_WIDTH,
} from "@/constants/worksheetColumnWidths";

// Widths are all "123px" strings.
const px = (value) => parseFloat(value) || 0;
const GUTTER_PX = px(ROW_NUM_WIDTH) + px(CHECKBOX_WIDTH);

// column -> { left, last } for every frozen column, or null when nothing is
// frozen, or when the frozen part would fill most of the screen (that would
// leave nothing to scroll).
export const computeFrozenLefts = (visibleColumns, frozenThrough, columnWidths = {}, screenWidth) => {
  const edge = frozenThrough ? visibleColumns.indexOf(frozenThrough) : -1;
  if (edge < 0) return null;
  const lefts = {};
  let left = GUTTER_PX;
  for (let i = 0; i <= edge; i += 1) {
    const column = visibleColumns[i];
    lefts[column] = { left, last: i === edge };
    left += px(columnWidths[column] || COLUMN_WIDTHS[column] || "150px");
  }
  const screen = screenWidth || (typeof window !== "undefined" ? window.innerWidth : 1600);
  return left > screen * 0.6 ? null : lefts;
};

// Inline style that pins one column's header or cell: above the scrolling
// cells, below the frozen gutter. The last frozen column gets a divider.
export const frozenStyle = (frozenLefts, column, zIndex = 15) => {
  const spot = frozenLefts?.[column];
  if (!spot) return undefined;
  return {
    position: "sticky",
    left: spot.left,
    zIndex,
    ...(spot.last ? { boxShadow: "inset -2px 0 0 #cbd5e1" } : {}),
  };
};
