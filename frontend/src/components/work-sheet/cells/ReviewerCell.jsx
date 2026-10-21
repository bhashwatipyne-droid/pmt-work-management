import { SearchableSelect } from "../SearchableSelect";
import { TableCell } from "@/components/ui/table";
import { WORKSHEET } from "@/constants/testIds";

// The "Reviewer" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderReviewerCell(r) {
  const { NONE_VALUE, canEditRow, cellProps, item, nameOf, onUpdate, openSelect, renderFillHandle, reviewerUsers, setOpenSelect, sheetCell } = r;
  return (
<TableCell {...cellProps(12)}>
  {canEditRow ? (
    <SearchableSelect
        open={openSelect === "reviewer"}
        onOpenChange={(open) => setOpenSelect(open ? "reviewer" : null)}
        value={item.reviewer_id || NONE_VALUE}
        onValueChange={(v) => onUpdate(item.id, { reviewer_id: v === NONE_VALUE ? null : v })}
        options={[
          { value: NONE_VALUE, label: "Unassigned" },
          ...reviewerUsers.map((user) => ({ value: user.id, label: user.name })),
        ]}
        placeholder="Reviewer"
        searchPlaceholder="Type reviewer name..."
        emptyText="No reviewers found"
        disabled={!canEditRow}
        triggerProps={sheetCell(12)}
        data-testid={`${WORKSHEET.reviewerSelect}-${item.id}`}
        contentClassName="w-[280px] p-0"
      />
  ) : (
    <span className="cell-plain block">{item.reviewer_id ? nameOf(item.reviewer_id) : "Unassigned"}</span>
  )}
  {renderFillHandle(12)}
</TableCell>
  );
}
