import { Input } from "@/components/ui/input";
import { MAX_WORK_DATE, MIN_WORK_DATE } from "@/lib/worksheetDates";
import { TableCell } from "@/components/ui/table";
import { WORKSHEET } from "@/constants/testIds";

// The "Date" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderDateCell(r) {
  const { canEditRow, cellProps, commitWorkDate, item, local, renderFillHandle, setLocal, sheetCell } = r;
  return (
<TableCell {...cellProps(0, null, { navShell: true })}>
  <Input
    {...sheetCell(0)}
    data-testid={`${WORKSHEET.dateInput}-${item.id}`}
    type="date"
    value={local.work_date}
    min={MIN_WORK_DATE}
    max={MAX_WORK_DATE}
    disabled={!canEditRow}
    onChange={(e) => setLocal((l) => ({ ...l, work_date: e.target.value }))}
    onBlur={commitWorkDate}
    className="sheet-date-input h-8 w-[130px] pl-7 pr-1"
  />

  {renderFillHandle(0)}
</TableCell>
  );
}
