import { SearchableSelect } from "../SearchableSelect";
import { StatusBadge } from "../StatusBadge";
import { TableCell } from "@/components/ui/table";
import { WORKSHEET } from "@/constants/testIds";

// The "Status" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderStatusCell(r) {
  const { NONE_VALUE, allowedStatuses, canEditRow, cellProps, item, onUpdate, openSelect, options, renderFillHandle, setOpenSelect, sheetCell } = r;
  return (
<TableCell {...cellProps(14)}>
  <SearchableSelect
    open={openSelect === "status"}
    onOpenChange={(open) => setOpenSelect(open ? "status" : null)}
    value={item.status || NONE_VALUE}
    onValueChange={(v) => onUpdate(item.id, { status: v })}
    options={(options.statuses || []).map((status) => ({
      value: status,
      label: status,
      disabled: !allowedStatuses?.includes(status),
    }))}
    renderValue={(_option, value) =>
      value && value !== NONE_VALUE ? (
        <StatusBadge status={value} />
      ) : (
        "Status"
      )
    }
    placeholder="Status"
    searchPlaceholder="Type status..."
    emptyText="No statuses found"
    disabled={!canEditRow}
    triggerProps={sheetCell(14)}
    data-testid={`${WORKSHEET.statusSelect}-${item.id}`}
    className="border-none bg-transparent shadow-none p-0"
    contentClassName="w-[280px] p-0"
  />
  {renderFillHandle(14)}
</TableCell>
  );
}
