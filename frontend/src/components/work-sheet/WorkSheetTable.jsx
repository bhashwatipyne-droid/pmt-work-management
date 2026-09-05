 import { useState, useEffect } from "react";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "../ui/table";
import { Checkbox } from "../ui/checkbox";
import { WorkSheetRow } from "./WorkSheetRow";
import { WORKSHEET } from "@/constants/testIds";
import { canEditWorkItem } from "@/lib/worksheetPermissions";

const COLUMNS = ["Date", "Project", "Deliverable", "Stage", "Deliverable Name", "Deliverable Link", "Type", "Category", "Version", "Time (min)", "Creator", "Reviewer", "Remarks", "Status"];

export const WorkSheetTable = ({
  items,
  currentUser,
  users,
  options,
  projects,
  deliverables,
  onUpdate,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll
}) => {
  const [activeCell, setActiveCell] = useState(null);
  const [fillState, setFillState] = useState(null);

  useEffect(() => {
    if (!fillState) return;

    const handleMouseUp = () => {
      setFillState((current) => {
        if (!current) return null;

        return {
          ...current,
          dragging: false,
        };
      });
    };

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [fillState]);

  const handleFillStart = ({ row, col }) => {
    setFillState({
      sourceRow: row,
      col,
      targetRow: row,
      dragging: true,
    });
  };

  const handleFillHover = (row) => {
    setFillState((current) => {
      if (!current?.dragging) return current;

      return {
        ...current,
        targetRow: row,
      };
    });
  };

  const handleFillEnd = () => {
    setFillState((current) => {
      if (!current?.dragging) return null;

      const { sourceRow, targetRow, col } = current;

      if (targetRow <= sourceRow) return null;

      const sourceItem = items[sourceRow - 1];

      if (!sourceItem) return null;

      const fieldMap = {
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

      const field = fieldMap[col];

      if (!field) return null;

      const value = sourceItem[field];

      items
        .slice(sourceRow, targetRow)
        .forEach((targetItem) => {
          onUpdate(targetItem.id, {
            [field]: value,
          });
        });

      return null;
    });
  };

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
                onCellSelect={setActiveCell}
                fillState={fillState}
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