import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "../ui/table";
import { Checkbox } from "../ui/checkbox";
import { WorkSheetRow } from "./WorkSheetRow";
import { WORKSHEET } from "@/constants/testIds";
import { canEditWorkItem } from "@/lib/worksheetPermissions";

const COLUMNS = [
  "Date",
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
  1: "project_id",
  2: "deliverable_id",
  3: "stage",
  4: "deliverable_name",
  5: "deliverable_link",
  6: "deliverable_type",
  7: "work_category",
  8: "version",
  9: "time_taken_minutes",
  10: "creator_id",
  11: "reviewer_id",
  12: "remarks",
  13: "status",
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
  onUpdate,
  onDelete,
  onFill,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}) => {
  const [activeCell, setActiveCell] = useState(null);
  const [selection, setSelection] = useState(null);
  const [fillState, setFillState] = useState(null);
  const [isFilling, setIsFilling] = useState(false);

  const scrollRef = useRef(null);
  const fillStateRef = useRef(null);
  const itemsRef = useRef(items);
  const onFillRef = useRef(onFill);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

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

  useEffect(() => {
    itemsRef.current = items;
    onFillRef.current = onFill;
  }, [items, onFill]);

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

    const field = FILL_FIELDS[current.sourceCol];
    const currentItems = itemsRef.current;
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
  }, []);

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
    items.length,
    Math.ceil((bodyScrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN
  );

  const visibleItems = items.slice(visibleStart, visibleEnd);
  const topSpacerHeight = visibleStart * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(
    0,
    (items.length - visibleEnd) * ROW_HEIGHT
  );

  const isAdmin = currentUser.role === "admin";
  const editableItems = useMemo(
    () => items.filter((item) => canEditWorkItem(currentUser, item, users)),
    [items, currentUser, users]
  );

  const allSelected =
    editableItems.length > 0 && selectedIds.length === editableItems.length;

  const totalCols = COLUMNS.length + 3; // #, checkbox, Actions

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
          <TableRow className="border-b border-slate-200 bg-[#f7f9fc] hover:bg-[#f7f9fc]">
            <TableHead className="row-num-head h-10 border-r border-slate-200 px-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              #
            </TableHead>

            <TableHead className="checkbox-cell h-10 border-r border-slate-200 px-3">
              <Checkbox
                data-testid="worksheet-select-all-checkbox"
                checked={allSelected}
                onCheckedChange={onToggleSelectAll}
                disabled={editableItems.length === 0}
              />
            </TableHead>

            {COLUMNS.map((column) => (
              <TableHead
                key={column}
                className="h-10 whitespace-nowrap border-r border-slate-200 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500"
              >
                {column}
              </TableHead>
            ))}

            <TableHead className="h-10 w-[52px] border-r border-slate-200 px-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {items.length === 0 ? (
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
                    projects={projects}
                    deliverablesByProject={deliverablesByProject}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    selected={selectedSet.has(item.id)}
                    onToggleSelect={onToggleSelect}
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