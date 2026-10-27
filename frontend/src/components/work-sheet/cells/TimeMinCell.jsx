import { Input } from "@/components/ui/input";
import { TableCell } from "@/components/ui/table";
import { WORKSHEET } from "@/constants/testIds";

// The "Time (min)" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderTimeMinCell(r) {
  const { canEditRow, cellProps, commitTime, item, local, renderFillHandle, setLocal, setTimeError, sheetCell, timeError, timeHint, timeMissing } = r;
  return (
<TableCell {...cellProps(10)}>
  <div className="flex items-center gap-1">
    <Input
      {...sheetCell(10)}
      data-testid={`${WORKSHEET.timeInput}-${item.id}`}
      // Text, not type="number": a number box hides where the cursor
      // is, so Left/Right could never move on to the next cell from
      // here. commitTime still checks the value (0-1440 minutes).
      type="text"
      inputMode="decimal"
      required
      aria-required="true"
      aria-invalid={timeMissing}
      placeholder={timeHint?.benchmark ? String(timeHint.benchmark) : "min"}
      title={
        timeMissing
          ? "Time is required. It is filled automatically when your benchmark exists for this deliverable type - otherwise enter the minutes."
          : undefined
      }
      value={local.time_taken_minutes}
      disabled={!canEditRow}
      onChange={(e) => {
        setTimeError("");
        setLocal((l) => ({ ...l, time_taken_minutes: e.target.value }));
      }}
      onBlur={commitTime}
      aria-invalid={timeMissing || Boolean(timeError)}
      className={`h-7 w-[64px] px-2 ${
        timeMissing || timeError
          ? "border-rose-400 bg-rose-50/70 ring-1 ring-rose-200 focus-visible:ring-rose-300"
          : ""
      }`}
    />
  </div>
  {timeError && (
    <p
      role="alert"
      data-testid={`worksheet-time-error-${item.id}`}
      className="mt-1 text-[11px] leading-4 text-rose-600"
    >
      {timeError}
    </p>
  )}
  {renderFillHandle(10)}
</TableCell>
  );
}
