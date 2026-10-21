import { SearchableSelect } from "../SearchableSelect";
import { TableCell } from "@/components/ui/table";

// The "Stage" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderStageCell(r) {
  const { NONE_VALUE, STAGES, canEditRow, cellProps, item, onUpdate, openSelect, renderFillHandle, setOpenSelect, sheetCell } = r;
  return (
<TableCell {...cellProps(4)}>
  <SearchableSelect
    open={openSelect === "stage"}
    onOpenChange={(open) => setOpenSelect(open ? "stage" : null)}
    value={item.stage || NONE_VALUE}
    onValueChange={(v) => onUpdate(item.id, { stage: v === NONE_VALUE ? null : v })}
    options={[
      { value: NONE_VALUE, label: "—" },
      ...STAGES.map((stage) => ({ value: stage, label: stage })),
    ]}
    placeholder="Stage"
    searchPlaceholder="Type stage..."
    emptyText="No stages found"
    disabled={!canEditRow}
    triggerProps={sheetCell(4)}
    data-testid={`worksheet-stage-select-${item.id}`}
    contentClassName="w-[200px] p-0"
  />
  {renderFillHandle(4)}
</TableCell>
  );
}
