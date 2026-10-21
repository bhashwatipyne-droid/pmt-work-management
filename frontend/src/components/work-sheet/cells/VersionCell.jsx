import { Input } from "@/components/ui/input";
import { TableCell } from "@/components/ui/table";
import { WORKSHEET } from "@/constants/testIds";

// The "Version" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderVersionCell(r) {
  const { canEditRow, cellProps, commit, item, local, renderFillHandle, setLocal, sheetCell } = r;
  return (
<TableCell {...cellProps(9)}>
  <Input
    {...sheetCell(9)}
    data-testid={`${WORKSHEET.versionInput}-${item.id}`}
    value={local.version}
    disabled={!canEditRow}
    onChange={(e) => setLocal((l) => ({ ...l, version: e.target.value }))}
    onBlur={() => commit("version", local.version)}
    className="h-7 w-[80px]"
    placeholder="v1"
  />
  {renderFillHandle(9)}
</TableCell>
  );
}
