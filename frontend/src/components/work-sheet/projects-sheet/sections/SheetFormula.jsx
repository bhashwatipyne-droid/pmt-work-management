import { WorksheetFormulaBar } from "@/components/work-sheet/WorksheetFormulaBar";

export function SheetFormula(ctx) {
  const { activeCol, activeTask, cols, commitText, flatRows, focusGrid, formulaEditable, formulaValue, moveCell } = ctx;
  return (
    <>
    <WorksheetFormulaBar
      label={activeTask ? activeCol.label : null}
      value={formulaValue}
      activeRow={activeTask ? flatRows.findIndex((t) => t.id === activeTask.id) : null}
      activeCol={activeCol ? cols.findIndex((c) => c.key === activeCol.key) : null}
      editable={formulaEditable}
      placeholder={activeTask ? "" : "Select a cell to see its value"}
      onCommit={(text) => activeTask && commitText(activeTask, activeCol.key, text)}
      onFinish={(move) => {
        if (move === "down") moveCell(1, 0);
        else if (move === "up") moveCell(-1, 0);
        else if (move === "right") moveCell(0, 1);
        else if (move === "left") moveCell(0, -1);
        focusGrid();
      }}
    />
    </>
  );
}
