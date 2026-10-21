import { TableCell } from "@/components/ui/table";
import { WORKSHEET } from "@/constants/testIds";

// The "Category" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderCategoryCell(r) {
  const { cellProps, item, renderFillHandle } = r;
  return (
<TableCell {...cellProps(8)}>
  <span
    data-testid={`${WORKSHEET.categorySelect}-${item.id}`}
    className="cell-plain block"
  >
    {item.work_category || "—"}
  </span>
  {renderFillHandle(8)}
</TableCell>
  );
}
