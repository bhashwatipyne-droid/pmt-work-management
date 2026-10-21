// Numbers shown in the bar under a multi-cell selection (how many cells are
// filled, unique values, time total, status split). Null for a single cell.
export const computeRangeStats = ({
  rangeSelection,
  sortedTableItems,
  visibleColumns,
  getSortValue,
  statusOrder = [],
}) => {
  if (!rangeSelection) return null;

  const r1 = Math.min(rangeSelection.anchorRow, rangeSelection.row);
  const r2 = Math.max(rangeSelection.anchorRow, rangeSelection.row);
  const c1 = Math.min(rangeSelection.anchorCol, rangeSelection.col);
  const c2 = Math.max(rangeSelection.anchorCol, rangeSelection.col);
  const rows = sortedTableItems.slice(r1 - 1, r2);
  const cols = visibleColumns.slice(c1, c2 + 1);
  if (!rows.length || !cols.length || rows.length * cols.length < 2) return null;

  let filled = 0;
  const unique = new Set();
  const times = [];
  const statuses = new Map();

  for (const item of rows) {
  for (const column of cols) {
    const value = getSortValue(item, column);
    if (value !== "" && value !== null && value !== undefined) {
      filled += 1;
      unique.add(String(value));
    }
    if (column === "Time (min)") {
      const minutes = Number(item.time_taken_minutes);
      if (minutes > 0) times.push(minutes);
    }
    if (column === "Status" && item.status) {
      statuses.set(item.status, (statuses.get(item.status) || 0) + 1);
    }
  }
  }

  const count = rows.length * cols.length;

  return {
  rows: rows.length,
  cols: cols.length,
  count,
  filled,
  empty: count - filled,
  unique: unique.size,
  times,
  statusCounts: [...statuses.entries()].sort(
    (a, b) => statusOrder.indexOf(a[0]) - statusOrder.indexOf(b[0])
  ),
  block: { r1, r2, c1, c2 },
  };
};
