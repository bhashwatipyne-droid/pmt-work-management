import { DURATION_HINT, durationApplies, durationPatch, durationSecondsOf, formatDurationSeconds, parseDurationSeconds } from "@/lib/quantity";
import { Input } from "@/components/ui/input";
import { TableCell } from "@/components/ui/table";

// The "Duration" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderDurationCell(r) {
  const { canEditRow, cellProps, durationError, durationText, item, onUpdate, renderFillHandle, setDurationError, setDurationText, sheetCell } = r;
  const applies = durationApplies(item);

  return (
<TableCell {...cellProps(16)}>
  {!applies ? (
    <span
      className="cell-plain block text-center text-[#d1d5db]"
      title="Duration applies to Animate rows only"
    >
      —
    </span>
  ) : (
    <Input
      {...sheetCell(16)}
      data-testid={`worksheet-duration-input-${item.id}`}
      type="text"
      inputMode="text"
      placeholder="sec"
      title={`Final video length. ${DURATION_HINT}`}
      aria-label="Video duration (seconds by default)"
      value={durationText}
      disabled={!canEditRow}
      onChange={(e) => {
        setDurationText(e.target.value);
        if (durationError) setDurationError("");
      }}
      onBlur={async () => {
        const current = durationSecondsOf(item);
        const parsed = parseDurationSeconds(durationText);

        if (!parsed.ok) {
          // Keep what was typed so it can be fixed; say why under the box.
          setDurationError(`Not a valid duration. ${DURATION_HINT}`);
          return;
        }
        setDurationError("");
        // 200 is shown as "3m 20s" whether or not it changed.
        setDurationText(formatDurationSeconds(parsed.seconds));
        if (parsed.seconds === current) return;
        const result = await onUpdate(item.id, durationPatch(parsed.seconds));
        if (result && result.success === false) {
          setDurationError("Could not save the duration. Try again.");
        }
      }}
      aria-invalid={Boolean(durationError)}
      className={`h-7 w-[104px] px-2 ${durationError ? "border-rose-400" : ""}`}
    />
  )}
  {applies && durationError && (
    <p
      role="alert"
      data-testid={`worksheet-duration-error-${item.id}`}
      className="mt-1 text-[11px] leading-4 text-rose-600"
    >
      {durationError}
    </p>
  )}
  {renderFillHandle(16)}
</TableCell>
  );
}
