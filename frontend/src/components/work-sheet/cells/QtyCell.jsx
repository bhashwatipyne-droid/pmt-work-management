import { Input } from "@/components/ui/input";
import { MAX_QUANTITY, isQtySet, loggedCount, qtyApplies, quantityOf, unitName } from "@/lib/quantity";
import { TableCell } from "@/components/ui/table";
import { toast } from "sonner";

// The "Qty" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderQtyCell(r) {
  const { QtyListIcon, QtyPlusIcon, canEditRow, cellProps, item, multiDeliverable, onOpenQty, onUpdate, options, qtyPanelOpen, qtyText, renderFillHandle, setQtyText, sheetCell } = r;
  const applies = qtyApplies(item);
  const isSet = isQtySet(item);
  const count = quantityOf(item);

  return (
<TableCell {...cellProps(15)}>
  {!applies ? (
    <span
      className="cell-plain block text-center text-[#d1d5db]"
      title="Qty applies to Design and Animate rows, and to Content rows on a Core deliverable type (not Non-Core activities)"
    >
      —
    </span>
  ) : isSet ? (
    // A number is already entered: this is a button that opens the
    // side panel (quantity + time for each unit), so it looks like one.
    <button
      type="button"
      {...sheetCell(15)}
      aria-haspopup="dialog"
      aria-expanded={qtyPanelOpen}
      data-testid={`worksheet-qty-chip-${item.id}`}
      title={
        multiDeliverable
          ? `${count} ${unitName(item, options, count)} ticked - click to log time for each`
          : `${count} ${unitName(item, options, count)} - click to log time for each`
      }
      onClick={() => onOpenQty?.(item.id)}
      className="qty-chip group/qty flex h-[26px] w-full items-center gap-1.5 rounded-[7px] pl-2 pr-1.5 tabular-nums transition-colors"
    >
      <span className="text-[13px] font-bold">{count}</span>
      <span className="flex-1 text-left text-[11px] text-[#2b2bb5] group-aria-expanded/qty:text-[#c8d5f0]">
        {loggedCount(item)}/{count}
      </span>
      <QtyListIcon className="shrink-0" />
    </button>
  ) : multiDeliverable ? (
    // Nothing ticked yet: Qty is filled in from the Deliverable cell.
    <span
      data-testid={`worksheet-qty-hint-${item.id}`}
      className="cell-plain block text-center text-[12px] text-[#9aa4bd]"
      title="Tick the deliverables this ideation covers in the Deliverable column. Qty fills in automatically."
    >
      Pick deliverables
    </span>
  ) : (
    <Input
      {...sheetCell(15)}
      data-testid={`worksheet-qty-input-${item.id}`}
      type="text"
      inputMode="numeric"
      placeholder="Qty"
      title="Type a number, then click it to log time for each one"
      aria-label="Quantity"
      value={qtyText}
      disabled={!canEditRow}
      onChange={(e) => setQtyText(e.target.value.replace(/[^0-9]/g, ""))}
      onBlur={() => {
        const text = qtyText.trim();
        setQtyText("");
        if (!text) return;
        const n = Number(text);
        if (!Number.isInteger(n) || n < 1 || n > MAX_QUANTITY) {
          toast.error(`Quantity must be a whole number from 1 to ${MAX_QUANTITY}.`);
          return;
        }
        onUpdate(item.id, { quantity: n, quantity_items: Array(n).fill(null) });
      }}
      className="peer qty-add h-[26px] w-full min-w-0 rounded-[7px] border border-[#eff0f2] bg-transparent py-0 pl-4 pr-2 text-center text-[12px] text-[#546490] shadow-none placeholder:text-[#546490] focus:pl-2 [&:not(:placeholder-shown)]:pl-2"
    />
  )}
  {applies && !isSet && !multiDeliverable && (
    // Plus sign in front of the "Qty" placeholder; gone once typing starts.
    <QtyPlusIcon className="pointer-events-none absolute left-[calc(50%-17.5px)] top-1/2 -translate-y-1/2 text-[#546490] peer-focus:hidden peer-[:not(:placeholder-shown)]:hidden" />
  )}
  {renderFillHandle(15)}
</TableCell>
  );
}
