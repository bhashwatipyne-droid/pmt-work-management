import { Checkbox } from "../ui/checkbox";
import { ChevronsLeftRight, Hand } from "lucide-react";
import { TableHead, TableHeader, TableRow } from "../ui/table";
import { WorksheetColumnMenu } from "./WorksheetColumnMenu";
import { computeFrozenLefts, frozenStyle } from "@/lib/worksheetFreeze";
import { toast } from "sonner";

export function WorkSheetTableHeader(ctx) {
  const { allSelected, allVisibleIds, clearColumnFilter, columnOrder, columnSort, columnWidths, draggedColumn, effectiveHiddenColumns, frozenLefts, frozenThrough, getHiddenColumnsAfter, getHiddenColumnsFromStart, gridTemplateColumns, handleColumnDrop, handleColumnResizeStart, headerRef, isColumnFiltered, onToggleSelectAll, renderColumnFilterControl, restoreHiddenColumns, setColumnSort, setDraggedColumn, setFrozenThrough, setHiddenColumns, visibleColumns } = ctx;
  return (
    <>
    {/* Frozen: the column titles stay at the top while the rows scroll. */}
    <TableHeader ref={headerRef} className="sticky top-0 z-40 bg-[#f7f9fc]">
      <TableRow
        className="border-b border-slate-200 bg-[#f7f9fc] hover:bg-[#f7f9fc]"
        style={{ display: "grid", gridTemplateColumns, minWidth: "max-content" }}
      >
        <TableHead
          className="row-num-head flex min-h-10 items-center justify-center bg-[#f7f9fc] px-0"
          style={{ gridColumn: 1 }}
        />


        <TableHead className="checkbox-cell relative flex min-h-10 items-center border-r border-slate-200 bg-[#f7f9fc] pl-1 pr-0" style={{ gridColumn: 2 }}>
          <Checkbox
            data-testid="worksheet-select-all-checkbox"
            className="rounded-[5px] border-slate-300 shadow-none"
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
          const isHidden = effectiveHiddenColumns.includes(column);

          if (isHidden) {
            return null;
          }

          const hiddenAfter = getHiddenColumnsAfter(columnIndex);

          return (
            <TableHead
              key={column}
              className={`group relative flex min-h-10 min-w-0 items-center justify-center whitespace-nowrap border-r border-slate-200 bg-[#f7f9fc] px-2 py-1 text-[12px] font-bold leading-4 text-slate-900 ${
                draggedColumn === column ? "opacity-50" : ""
              }`}
              style={{
                gridColumn: visibleColumns.indexOf(column) + 3,
                ...frozenStyle(frozenLefts, column, 36),
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleColumnDrop(column)}
            >
              <div
                className="group/header flex w-full min-w-0 items-center overflow-hidden justify-center gap-1"
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
                  className="inline-flex h-5 w-4 shrink-0 cursor-grab items-center justify-center rounded text-slate-400 opacity-0 transition-opacity group-hover/header:opacity-100 active:cursor-grabbing"
                >
                  <Hand className="h-3.5 w-3.5" />
                </span>

                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  className="flex max-w-full min-w-0 items-center overflow-hidden rounded px-1 py-0.5 text-center hover:text-slate-900"
                  title={column === "Time (min)" ? `${column} - required` : column}
                >
                  <span className="block min-w-0 truncate">{column}</span>
                  {/* Outside the truncating label so the marker stays visible in a narrow column. */}
                  {column === "Time (min)" && (
                    <span
                      className="ml-0.5 shrink-0 text-rose-500"
                      title="Required"
                      aria-label="required"
                    >
                      *
                    </span>
                  )}
                </button>

                <WorksheetColumnMenu
                  column={column}
                  isSorted={columnSort.key === column}
                  isFiltered={isColumnFiltered(column)}
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
                  isFrozen={frozenThrough === column}
                  onFreeze={() => {
                    const lefts = computeFrozenLefts(visibleColumns, column, columnWidths);
                    if (!lefts) {
                      toast.error("Those columns are too wide to freeze on this screen. Narrow them or freeze an earlier column.");
                      return;
                    }
                    setFrozenThrough(column);
                  }}
                  onUnfreeze={() => setFrozenThrough(null)}
                  onHide={() =>
                    setHiddenColumns((current) =>
                      current.includes(column)
                        ? current
                        : [...current, column]
                    )
                  }
                  filterControl={renderColumnFilterControl(column)}
                  onClearFilter={() => clearColumnFilter(column)}
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

              <div
                onMouseDown={(event) =>
                  handleColumnResizeStart(event, column)
                }
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                className="group/resize absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize"
                title="Drag to resize column"
              >
                <div className="mx-auto h-full w-px bg-transparent group-hover/resize:bg-slate-400" />
              </div>
            </TableHead>
          );
        })}
      </TableRow>
    </TableHeader>
    </>
  );
}
