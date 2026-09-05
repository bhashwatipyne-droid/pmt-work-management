import { useEffect, useState } from "react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "../ui/table";
import { Checkbox } from "../ui/checkbox";
import { WorkSheetRow } from "./WorkSheetRow";
import { WORKSHEET } from "@/constants/testIds";
import { canEditWorkItem } from "@/lib/worksheetPermissions";

const COLUMNS = ["Date", "Project", "Deliverable", "Stage", "Deliverable Name", "Deliverable Link", "Type", "Category", "Version", "Time (min)", "Creator", "Reviewer", "Remarks", "Status"];

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

export const WorkSheetTable = ({
  items,
  currentUser,
  users,
  options,
  projects,
  deliverables,
  onUpdate,
  onFill,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll
}) => {
  const [activeCell, setActiveCell] = useState(null);
  const [selection, setSelection] = useState(null);
  const [fillState, setFillState] = useState(null);
  const [isFilling, setIsFilling] = useState(false);

  const handleCellSelect = ({ row, col }) => {
    setActiveCell({ row, col });
    setSelection({
      startRow: row,
      endRow: row,
      col,
    });
  };

  const handleFillStart = ({ row, col }) => {
    setIsFilling(true);

    setFillState({
      sourceRow: row,
      sourceCol: col,
      targetRow: row,
    });

    setSelection({
      startRow: row,
      endRow: row,
      col,
    });
  };

  const handleFillHover = (row) => {
    if (!isFilling || !fillState) return;

    setFillState((prev) => ({
      ...prev,
      targetRow: row,
    }));

    setSelection({
      startRow: fillState.sourceRow,
      endRow: row,
      col: fillState.sourceCol,
    });
  };

  const handleFillEnd = async () => {
    if (!isFilling || !fillState) {
      setIsFilling(false);
      return;
    }

    const {
      sourceRow,
      sourceCol,
      targetRow,
    } = fillState;

    setIsFilling(false);
    setFillState(null);

    if (targetRow <= sourceRow) {
      setSelection(null);
      return;
    }

    const field = FILL_FIELDS[sourceCol];

    if (!field) {
      setSelection(null);
      return;
    }

    // `sourceRow`/`targetRow` follow the 1-based `index` convention used
    // throughout WorkSheetRow (index = idx + 1), so the source item sits
    // at items[sourceRow - 1] and the fill target range is items[sourceRow..targetRow).
    const sourceItem = items[sourceRow - 1];

    if (!sourceItem) {
      setSelection(null);
      return;
    }

    const value = sourceItem[field];

    const targetIds = items
      .slice(sourceRow, targetRow)
      .map((item) => item.id);

    if (!targetIds.length) {
      setSelection(null);
      return;
    }

    await onFill(targetIds, field, value);

    setSelection(null);
  };

  // Global pointer tracking while a fill drag is active — far more
  // reliable than relying solely on per-row onPointerEnter/onMouseUp.
  useEffect(() => {
    if (!isFilling) return;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFilling, fillState]);

  const isAdmin = currentUser.role === "admin";
  const editableItems = items.filter((it) => canEditWorkItem(currentUser, it, users));
  const allSelected = editableItems.length > 0 && selectedIds.length === editableItems.length;
  const totalCols = COLUMNS.length + 2; // #, checkbox, cols

  return (
    <div className="flex-1 overflow-auto sheet-mode">
      <Table data-testid={WORKSHEET.table}>
        <TableHeader>
          <TableRow>
            <TableHead className="row-num-head">#</TableHead>
            <TableHead className="checkbox-cell">
              <Checkbox
                data-testid="worksheet-select-all-checkbox"
                checked={allSelected}
                onCheckedChange={onToggleSelectAll}
                disabled={editableItems.length === 0}
              />
            </TableHead>
            {COLUMNS.map((c) => (
              <TableHead key={c}>{c}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <td colSpan={totalCols} data-testid={WORKSHEET.emptyState} className="py-16 text-center">
                <p className="text-sm font-medium text-slate-700">No work items yet</p>
                <p className="text-xs text-slate-500">Add a row to start logging work.</p>
              </td>
            </TableRow>
          ) : (
            items.map((item, idx) => (
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
                index={idx + 1}
                currentUser={currentUser}
                users={users}
                options={options}
                projects={projects}
                deliverables={deliverables}
                onUpdate={onUpdate}
                selected={selectedIds.includes(item.id)}
                onToggleSelect={onToggleSelect}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};