import { SearchableSelect } from "../SearchableSelect";
import { TableCell } from "@/components/ui/table";
import { WORKSHEET } from "@/constants/testIds";
import { typeChangePatch } from "@/lib/quantity";

// The "Deliverable Type" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderDeliverableTypeCell(r) {
  const { NONE_VALUE, canEditRow, cellProps, item, onUpdate, openSelect, options, renderFillHandle, setOpenSelect, sheetCell } = r;
  return (
<TableCell {...cellProps(7)}>
  {canEditRow ? (
    <SearchableSelect
        open={openSelect === "type"}
        onOpenChange={(open) => setOpenSelect(open ? "type" : null)}
        value={item.deliverable_type || NONE_VALUE}
        onValueChange={(v) => {
          const nextType = v === NONE_VALUE ? "" : v;
          onUpdate(item.id, typeChangePatch(item, nextType, options.deliverable_type_categories));
        }}
        options={[
          { value: NONE_VALUE, label: "—" },
          ...(options.deliverable_types || []).map((type) => ({ value: type, label: type })),
        ]}
        placeholder="Deliverable Type"
        searchPlaceholder="Type to search..."
        emptyText="No types found"
        disabled={!canEditRow}
        triggerProps={sheetCell(7)}
        data-testid={`${WORKSHEET.typeSelect}-${item.id}`}
        contentClassName="w-[440px] p-0"
      />
  ) : (
    <span className="cell-plain block">{item.deliverable_type || "—"}</span>
  )}
  {renderFillHandle(7)}
</TableCell>
  );
}
