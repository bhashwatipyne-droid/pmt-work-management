import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronsLeftRight,
  Filter,
  Hand,
} from "lucide-react";
import { WorksheetColumnMenu } from "./WorksheetColumnMenu";
import { buildGridTemplateColumns } from "@/constants/worksheetColumnWidths";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "../ui/table";
import { Checkbox } from "../ui/checkbox";
import { WorkSheetRow } from "./WorkSheetRow";
import { WORKSHEET } from "@/constants/testIds";

const COLUMNS = [
  "Date",
  "Client",
  "Project",
  "Deliverable",
  "Stage",
  "Deliverable Name",
  "Deliverable Link",
  "Type",
  "Category",
  "Version",
  "Time (min)",
  "Creator",
  "Reviewer",
  "Remarks",
  "Status",
];

const FILL_FIELDS = {
  0: "work_date",
  1: "client_id",
  2: "project_id",
  3: "deliverable_id",
  4: "stage",
  5: "deliverable_name",
  6: "deliverable_link",
  7: "deliverable_type",
  8: "work_category",
  9: "version",
  10: "time_taken_minutes",
  11: "creator_id",
  12: "reviewer_id",
  13: "remarks",
  14: "status",
};

const COLUMN_FIELDS = {
  Date: "work_date",
  Client: "client_id",
  Project: "project_id",
  Deliverable: "deliverable_id",
  Stage: "stage",
  "Deliverable Name": "deliverable_name",
  "Deliverable Link": "deliverable_link",
  Type: "deliverable_type",
  Category: "work_category",
  Version: "version",
  "Time (min)": "time_taken_minutes",
  Creator: "creator_id",
  Reviewer: "reviewer_id",
  Remarks: "remarks",
  Status: "status",
};

// The worksheet is intentionally virtualized without adding a new dependency.
// Only the visible rows + a small overscan buffer are mounted in the DOM.
const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 40;
const OVERSCAN = 20;

export const WorkSheetTable = ({
  items,
  currentUser,
  users,
  options,
  projects,
  deliverables,
  clients = [],
  onUpdate,
  onDelete,
  onFill,
  filters,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  hiddenRows,
  setHiddenRows,
  onOpenFilters,
  sheetKey = "Master",
}) => {
  const [activeCell, setActiveCell] = useState(null);
  const [selection, setSelection] = useState(null);
  const [columnSort, setColumnSort] = useState({
    key: null,
    direction: "asc",
  });
  const [hiddenColumns, setHiddenColumns] = useState(() => {
    try {
      const saved = localStorage.getItem("worksheet_hidden_columns");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const columnOrderKey = `worksheet_column_order_${currentUser.id}`;
  const rowOrderKey = `worksheet_row_order_${currentUser.id}_${sheetKey}`;

  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`worksheet_column_order_${currentUser.id}`) || "null");
      if (!Array.isArray(saved)) return COLUMNS;
      const valid = saved.filter((column) => COLUMNS.includes(column));
      const missing = COLUMNS.filter((column) => !valid.includes(column));
      return [...valid, ...missing];
    } catch {
      return COLUMNS;
    }
  });

  const [rowOrder, setRowOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`worksheet_row_order_${currentUser.id}_${sheetKey}`) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [draggedRow, setDraggedRow] = useState(null);
  const rowOrderScopeRef = useRef(rowOrderKey);
  const [fillState, setFillState] = useState(null);
  const [isFilling, setIsFilling] = useState(false);

  const scrollRef = useRef(null);
  const fillStateRef = useRef(null);
  const itemsRef = useRef(items);
  const sortedItemsRef = useRef(items);
  const onFillRef = useRef(onFill);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  useEffect(() => {
    localStorage.setItem(columnOrderKey, JSON.stringify(columnOrder));
  }, [columnOrder, columnOrderKey]);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(`worksheet_row_order_${currentUser.id}_${sheetKey}`) || "[]"
      );
      setRowOrder(Array.isArray(saved) ? saved : []);
    } catch {
      setRowOrder([]);
    }
    rowOrderScopeRef.current = rowOrderKey;
  }, [currentUser.id, sheetKey, rowOrderKey]);

  useEffect(() => {
    setRowOrder((current) => {
      const missing = items
        .map((item) => item.id)
        .filter((id) => !current.includes(id));
      return missing.length ? [...current, ...missing] : current;
    });
  }, [items]);

  useEffect(() => {
    if (rowOrderScopeRef.current !== rowOrderKey) return;
    localStorage.setItem(rowOrderKey, JSON.stringify(rowOrder));
  }, [rowOrder, rowOrderKey]);

  useEffect(() => {
    localStorage.setItem(
      "worksheet_hidden_columns",
      JSON.stringify(hiddenColumns)
    );
  }, [hiddenColumns]);

  // Pre-index data once instead of doing a full .filter() inside every row.
  const deliverablesByProject = useMemo(() => {
    const map = {};

    for (const deliverable of deliverables || []) {
      if (!deliverable.project_id) continue;

      if (!map[deliverable.project_id]) {
        map[deliverable.project_id] = [];
      }

      map[deliverable.project_id].push(deliverable);
    }

    return map;
  }, [deliverables]);

  const usersById = useMemo(() => {
    const map = {};

    for (const user of users || []) {
      map[user.id] = user;
    }

    return map;
  }, [users]);

  const nonAdminUsers = useMemo(
    () => (users || []).filter((user) => user.role !== "admin"),
    [users]
  );

  const reviewerUsers = useMemo(
    () => (users || []).filter((user) => user.role !== "member"),
    [users]
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const getSortValue = useCallback(
    (item, column) => {
      const field = COLUMN_FIELDS[column];

      if (!field) return "";

      let value = item[field];

      if (column === "Client") {
        const project = projects.find((p) => p.id === item.project_id);
        const clientId = item.client_id || project?.client_id;
        value = clients.find((c) => c.id === clientId)?.name || "";
      }

      if (column === "Project") {
        value = projects.find((p) => p.id === item.project_id)?.name || "";
      }

      if (column === "Deliverable") {
        value =
          deliverables.find((d) => d.id === item.deliverable_id)?.name || "";
      }

      if (column === "Creator") {
        value = usersById[item.creator_id]?.name || "";
      }

      if (column === "Reviewer") {
        value = usersById[item.reviewer_id]?.name || "";
      }

      if (value === null || value === undefined) return "";

      return value;
    },
    [clients, projects, deliverables, usersById]
  );

  const hiddenRowSet = useMemo(
    () => new Set(hiddenRows),
    [hiddenRows]
  );

  const sortedAllTableItems = useMemo(() => {
    if (!columnSort.key) {
      return items;
    }

    const sorted = [...items];

    sorted.sort((a, b) => {
      const aValue = getSortValue(a, columnSort.key);
      const bValue = getSortValue(b, columnSort.key);

      if (typeof aValue === "number" && typeof bValue === "number") {
        return columnSort.direction === "asc"
          ? aValue - bValue
          : bValue - aValue;
      }

      return columnSort.direction === "asc"
        ? String(aValue).localeCompare(String(bValue), undefined, {
            numeric: true,
            sensitivity: "base",
          })
        : String(bValue).localeCompare(String(aValue), undefined, {
            numeric: true,
            sensitivity: "base",
          });
    });

    return sorted;
  }, [items, columnSort, getSortValue]);

  const personallyOrderedItems = useMemo(() => {
    if (!rowOrder.length || columnSort.key) return sortedAllTableItems;

    const byId = new Map(sortedAllTableItems.map((item) => [item.id, item]));
    const ordered = rowOrder
      .map((id) => byId.get(id))
      .filter(Boolean);
    const orderedIds = new Set(ordered.map((item) => item.id));

    return [
      ...ordered,
      ...sortedAllTableItems.filter((item) => !orderedIds.has(item.id)),
    ];
  }, [sortedAllTableItems, rowOrder, columnSort.key]);

  const visibleTableItems = useMemo(
    () => personallyOrderedItems.filter((item) => !hiddenRowSet.has(item.id)),
    [personallyOrderedItems, hiddenRowSet]
  );

  const sortedTableItems = visibleTableItems;

  // Tracks which hidden rows sit immediately before each visible row.
  const hiddenRowsBeforeById = useMemo(() => {
    const result = {};
    let pendingHiddenRows = [];

    for (const item of personallyOrderedItems) {
      if (hiddenRowSet.has(item.id)) {
        pendingHiddenRows.push(item.id);
        continue;
      }

      result[item.id] = pendingHiddenRows;
      pendingHiddenRows = [];
    }

    result.__trailing__ = pendingHiddenRows;

    return result;
  }, [personallyOrderedItems, hiddenRowSet]);

  const displayRowNumberById = useMemo(() => {
    const result = {};

    personallyOrderedItems.forEach((item, index) => {
      result[item.id] = index + 1;
    });

    return result;
  }, [personallyOrderedItems]);

  useEffect(() => {
    itemsRef.current = items;
    sortedItemsRef.current = sortedTableItems;
    onFillRef.current = onFill;
  }, [items, sortedTableItems, onFill]);

  const handleCellSelect = useCallback(({ row, col }) => {
    setActiveCell({ row, col });
    setSelection({
      startRow: row,
      endRow: row,
      col,
    });
  }, []);

  const handleFillStart = useCallback(({ row, col }) => {
    const next = {
      sourceRow: row,
      sourceCol: col,
      targetRow: row,
    };

    fillStateRef.current = next;
    setIsFilling(true);
    setFillState(next);

    setSelection({
      startRow: row,
      endRow: row,
      col,
    });
  }, []);

  const handleFillHover = useCallback((row) => {
    const current = fillStateRef.current;
    if (!current) return;

    const next = {
      ...current,
      targetRow: row,
    };

    fillStateRef.current = next;
    setFillState(next);

    setSelection((prev) => {
      if (!prev) return prev;
      return { ...prev, endRow: row };
    });
  }, []);

  const handleFillEnd = useCallback(async () => {
    const current = fillStateRef.current;

    fillStateRef.current = null;
    setIsFilling(false);
    setFillState(null);
    setSelection(null);

    if (!current || current.targetRow <= current.sourceRow) return;

    const sourceColumn = columnOrder[current.sourceCol];
    const field = COLUMN_FIELDS[sourceColumn];
    const currentItems = sortedItemsRef.current;
    const sourceItem = currentItems[current.sourceRow - 1];

    if (!field || !sourceItem) return;

    const value = sourceItem[field];
    const targetIds = currentItems
      .slice(current.sourceRow, current.targetRow)
      .map((item) => item.id);

    if (!targetIds.length) return;

    try {
      await onFillRef.current(targetIds, field, value);
    } catch {
      // onFill is responsible for displaying the persistence error.
    }
  }, [columnOrder]);

  // Global pointer tracking while a fill drag is active.
  useEffect(() => {
    if (!isFilling) return undefined;

    const handlePointerMove = (event) => {
      const element = document.elementFromPoint(
        event.clientX,
        event.clientY
      );

      const cell = element?.closest("[data-sheet-cell]");
      if (!cell) return;

      const row = Number(cell.getAttribute("data-sheet-row"));
      if (Number.isNaN(row)) return;

      handleFillHover(row);
    };

    const handlePointerUp = () => {
      handleFillEnd();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isFilling, handleFillHover, handleFillEnd]);

  // Measure the scroll viewport so the number of mounted rows stays small.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;

    const updateViewport = () => {
      setViewportHeight(Math.max(200, element.clientHeight));
    };

    updateViewport();

    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((event) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const bodyScrollTop = Math.max(0, scrollTop - HEADER_HEIGHT);

  const visibleStart = Math.max(
    0,
    Math.floor(bodyScrollTop / ROW_HEIGHT) - OVERSCAN
  );

  const visibleEnd = Math.min(
    sortedTableItems.length,
    Math.ceil((bodyScrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN
  );

  const visibleItems = sortedTableItems.slice(visibleStart, visibleEnd);
  const topSpacerHeight = visibleStart * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(
    0,
    (sortedTableItems.length - visibleEnd) * ROW_HEIGHT
  );

  const allVisibleIds = useMemo(
    () => sortedTableItems.map((item) => item.id),
    [sortedTableItems]
  );

  const allSelected =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedSet.has(id));

  const visibleColumns = columnOrder.filter((column) => !hiddenColumns.includes(column));
  const gridTemplateColumns = buildGridTemplateColumns(visibleColumns);

  const totalCols = COLUMNS.length + 3; // #, checkbox, Actions

  const handleColumnDrop = (targetColumn) => {
    if (!draggedColumn || draggedColumn === targetColumn) return;

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

  const handleRowDrop = (targetId) => {
    if (columnSort.key || !draggedRow || draggedRow === targetId) return;

    setRowOrder((current) => {
      const next = current.length ? [...current] : items.map((item) => item.id);
      const fromIndex = next.indexOf(draggedRow);
      const toIndex = next.indexOf(targetId);
      if (fromIndex === -1 || toIndex === -1) return current;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, draggedRow);
      return next;
    });
    setActiveCell(null);
    setSelection(null);
    setDraggedRow(null);
  };

  const getHiddenColumnsAfter = (columnIndex) => {
    const hidden = [];

    for (let i = columnIndex + 1; i < columnOrder.length; i += 1) {
      if (!hiddenColumns.includes(columnOrder[i])) {
        break;
      }

      hidden.push(columnOrder[i]);
    }

    return hidden;
  };

  const getHiddenColumnsFromStart = () => {
    const hidden = [];

    for (const column of columnOrder) {
      if (!hiddenColumns.includes(column)) {
        break;
      }

      hidden.push(column);
    }

    return hidden;
  };

  const restoreHiddenColumns = (columns) => {
    setHiddenColumns((current) =>
      current.filter((column) => !columns.includes(column))
    );
  };

  const restoreHiddenRows = (rowIds) => {
    if (!rowIds?.length) return;

    setHiddenRows((current) =>
      current.filter((id) => !rowIds.includes(id))
    );
  };

  // A column funnel is shown as active only when that column has a
  // corresponding filter applied in the universal filter panel.
  const isColumnFiltered = (column) => {
    switch (column) {
      case "Date":
        return Boolean(filters?.date_from || filters?.date_to);
      case "Project":
        return Boolean(filters?.project_ids?.length);
      case "Deliverable":
        return Boolean(filters?.deliverable_ids?.length);
      case "Stage":
        return Boolean(filters?.stages?.length);
      case "Type":
        return Boolean(filters?.deliverable_types?.length);
      case "Category":
        return Boolean(filters?.work_categories?.length);
      case "Creator":
        return Boolean(filters?.creator_ids?.length);
      case "Reviewer":
        return Boolean(filters?.reviewer_ids?.length);
      case "Status":
        return Boolean(filters?.statuses?.length);
      default:
        return false;
    }
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-auto bg-white sheet-mode"
    >
      <Table
        data-testid={WORKSHEET.table}
        className="min-w-max border-collapse"
      >
        <TableHeader>
          <TableRow
            className="border-b border-slate-200 bg-[#f7f9fc] hover:bg-[#f7f9fc]"
            style={{ display: "grid", gridTemplateColumns, minWidth: "max-content" }}
          >
            <TableHead className="row-num-head flex h-10 items-center justify-center border-r border-slate-200 px-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500" style={{ gridColumn: 1 }}>
              #
            </TableHead>

            <TableHead className="checkbox-cell relative flex h-10 items-center border-r border-slate-200 px-3" style={{ gridColumn: 2 }}>
              <Checkbox
                data-testid="worksheet-select-all-checkbox"
                checked={allSelected}
                onCheckedChange={onToggleSelectAll}
                disabled={allVisibleIds.length === 0}
              />

              {getHiddenColumnsFromStart().length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    restoreHiddenColumns(getHiddenColumnsFromStart())
                  }
                  className="absolute -right-2 top-1/2 z-30 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-blue-50 hover:text-blue-600"
                  title={`Show ${getHiddenColumnsFromStart().length} hidden column${
                    getHiddenColumnsFromStart().length === 1 ? "" : "s"
                  }`}
                  aria-label="Show hidden columns"
                >
                  <ChevronsLeftRight className="h-3 w-3" />
                </button>
              )}
            </TableHead>

            {columnOrder.map((column, columnIndex) => {
              const isHidden = hiddenColumns.includes(column);

              if (isHidden) {
                return null;
              }

              const hiddenAfter = getHiddenColumnsAfter(columnIndex);

              return (
                <TableHead
                  key={column}
                  className={`group relative flex h-10 min-w-0 items-center whitespace-nowrap border-r border-slate-200 px-1 text-[12px] font-semibold text-slate-600 ${
                    draggedColumn === column ? "opacity-50" : ""
                  }`}
                  style={{ gridColumn: visibleColumns.indexOf(column) + 3 }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleColumnDrop(column)}
                >
                  <div
                    className="group/header flex min-w-0 items-center gap-0"
                    draggable
                    onDragStart={(event) => {
                      event.stopPropagation();
                      setDraggedColumn(column);
                    }}
                    onDragEnd={() => setDraggedColumn(null)}
                    title={`Drag ${column} column`}
                  >
                    <span
                      aria-hidden="true"
                      className="mr-0.5 inline-flex h-5 w-4 shrink-0 cursor-grab items-center justify-center rounded text-slate-400 opacity-0 transition-opacity group-hover/header:opacity-100 active:cursor-grabbing"
                    >
                      <Hand className="h-3.5 w-3.5" />
                    </span>

                    <button
                      type="button"
                      onClick={(event) => event.stopPropagation()}
                      className="flex min-w-0 flex-1 items-center justify-start rounded px-0 py-0.5 text-left hover:text-slate-800"
                      title={column}
                    >
                      <span className="min-w-0 whitespace-nowrap">{column}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenFilters?.()}
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition ${
                        isColumnFiltered(column)
                          ? "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700"
                          : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      }`}
                      title={
                        isColumnFiltered(column)
                          ? `${column} filter active`
                          : `Filter ${column}`
                      }
                      aria-label={
                        isColumnFiltered(column)
                          ? `${column} filter active`
                          : `Filter ${column}`
                      }
                    >
                      <Filter className="h-3 w-3" />
                    </button>

                    <WorksheetColumnMenu
                      column={column}
                      onSortAsc={() =>
                        setColumnSort({
                          key: column,
                          direction: "asc",
                        })
                      }
                      onSortDesc={() =>
                        setColumnSort({
                          key: column,
                          direction: "desc",
                        })
                      }
                      onFilter={() => {
                        onOpenFilters?.();
                      }}
                      onHide={() =>
                        setHiddenColumns((current) =>
                          current.includes(column)
                            ? current
                            : [...current, column]
                        )
                      }
                    />
                  </div>

                  {hiddenAfter.length > 0 && (
                    <button
                      type="button"
                      onClick={() => restoreHiddenColumns(hiddenAfter)}
                      className="absolute -right-2 top-1/2 z-30 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-blue-50 hover:text-blue-600"
                      title={`Show ${hiddenAfter.length} hidden column${
                        hiddenAfter.length === 1 ? "" : "s"
                      }`}
                      aria-label="Show hidden columns"
                    >
                      <ChevronsLeftRight className="h-3 w-3" />
                    </button>
                  )}
                </TableHead>
              );
            })}

            <TableHead className="flex h-10 w-[52px] items-center justify-center border-r border-slate-200 px-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500" style={{ gridColumn: visibleColumns.length + 3 }}>
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {sortedTableItems.length === 0 ? (
            <TableRow>
              <td
                colSpan={totalCols}
                data-testid={WORKSHEET.emptyState}
                className="py-16 text-center"
              >
                <p className="text-sm font-medium text-slate-700">
                  No work items yet
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Add a row to start logging work.
                </p>
              </td>
            </TableRow>
          ) : (
            <>
              {topSpacerHeight > 0 && (
                <TableRow aria-hidden="true">
                  <td
                    colSpan={totalCols}
                    style={{ height: topSpacerHeight, padding: 0 }}
                  />
                </TableRow>
              )}

              {visibleItems.map((item, localIndex) => {
                const index = visibleStart + localIndex + 1;

                return (
                  <WorkSheetRow
                    key={item.id}
                    activeCell={activeCell}
                    selection={selection}
                    fillState={fillState}
                    onCellSelect={handleCellSelect}
                    onFillStart={handleFillStart}
                    onFillHover={handleFillHover}
                    onFillEnd={handleFillEnd}
                    item={item}
                    index={index}
                    currentUser={currentUser}
                    users={users}
                    usersById={usersById}
                    nonAdminUsers={nonAdminUsers}
                    reviewerUsers={reviewerUsers}
                    options={options}
                    clients={clients}
                    projects={projects}
                    deliverablesByProject={deliverablesByProject}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    hiddenColumns={hiddenColumns}
                    columnOrder={columnOrder}
                    onRowDragStart={(event, rowId) => {
                      event.dataTransfer.effectAllowed = "move";
                      setDraggedRow(rowId);
                    }}
                    onRowDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onRowDrop={(event, rowId) => {
                      event.preventDefault();
                      handleRowDrop(rowId);
                    }}
                    onRowDragEnd={() => setDraggedRow(null)}
                    isRowDragging={draggedRow === item.id}
                    canDragRow={!columnSort.key}
                    selected={selectedSet.has(item.id)}
                    onToggleSelect={onToggleSelect}
                    displayRowNumber={displayRowNumberById[item.id]}
                    hiddenRowIdsBefore={hiddenRowsBeforeById[item.id] || []}
                    hiddenRowIdsAfter={
                      item.id === sortedTableItems[sortedTableItems.length - 1]?.id
                        ? hiddenRowsBeforeById.__trailing__ || []
                        : []
                    }
                    onUnhideRows={restoreHiddenRows}
                    onHideRow={(rowId) => {
                      setHiddenRows((current) =>
                        current.includes(rowId)
                          ? current
                          : [...current, rowId]
                      );

                      if (selectedSet.has(rowId)) {
                        onToggleSelect(rowId);
                      }
                    }}
                  />
                );
              })}

              {bottomSpacerHeight > 0 && (
                <TableRow aria-hidden="true">
                  <td
                    colSpan={totalCols}
                    style={{ height: bottomSpacerHeight, padding: 0 }}
                  />
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
};