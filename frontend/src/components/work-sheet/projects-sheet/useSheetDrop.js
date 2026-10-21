import { toast } from "sonner";

export function useSheetDrop({ flatRows, inGroup, orderOf, rowDrag, save, setDropAt, setRowDrag }) {
  // Drop dragged rows above / below another row: give them sort_orders
  // between that row and its neighbour.
  const dropRows = (targetId, pos) => {
    const ids = rowDrag || [];
    setRowDrag(null);
    setDropAt(null);
    if (!ids.length || ids.includes(targetId)) return;
    const rest = flatRows.filter((t) => !ids.includes(t.id));
    const at = rest.findIndex((t) => t.id === targetId) + (pos === "below" ? 1 : 0);
    const before = rest[at - 1];
    const after = rest[at];
    const lo = before ? orderOf(before) : (after ? orderOf(after) : 0) - 1000;
    const hi = after ? orderOf(after) : lo + 1000 * (ids.length + 1);
    const moving = flatRows.filter((t) => ids.includes(t.id));
    const step = (hi - lo) / (moving.length + 1);
    inGroup(() => moving.forEach((t, i) => save(t, { sort_order: lo + step * (i + 1) })));
    toast(`Moved ${moving.length} row${moving.length === 1 ? "" : "s"}`);
  };


  return { dropRows };
}
