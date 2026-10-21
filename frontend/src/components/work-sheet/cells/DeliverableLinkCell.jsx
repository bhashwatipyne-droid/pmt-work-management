import { AutoGrowTextarea } from "../AutoGrowTextarea";
import { TableCell } from "@/components/ui/table";
import { WORKSHEET } from "@/constants/testIds";

// The "Deliverable Link" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderDeliverableLinkCell(r) {
  const { canEditRow, cellProps, commit, item, local, renderFillHandle, setLocal, sheetCell } = r;
  return (
<TableCell {...cellProps(6)}>
  {canEditRow ? (
    <AutoGrowTextarea
      {...sheetCell(6)}
      data-testid={`${WORKSHEET.deliverableLinkInput}-${item.id}`}
      value={local.deliverable_link}
      onChange={(e) =>
        setLocal((l) => ({ ...l, deliverable_link: e.target.value.replace(/[\r\n]+/g, "") }))
      }
      onBlur={() => commit("deliverable_link", local.deliverable_link)}
      placeholder="Paste drive link"
    />
  ) : item.deliverable_link ? (
    <a href={item.deliverable_link} target="_blank" rel="noreferrer" className="cell-plain block text-indigo-600 underline">
      {item.deliverable_link}
    </a>
  ) : (
    <span className="cell-plain block">—</span>
  )}
  {renderFillHandle(6)}
</TableCell>
  );
}
