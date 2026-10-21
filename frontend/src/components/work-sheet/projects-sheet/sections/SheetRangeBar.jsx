import { RangeSelectionBar } from "@/components/work-sheet/RangeSelectionBar";

export function SheetRangeBar(ctx) {
  const { block, cols, copyBlock, flatRows, gridRef, isMulti, selIds, setRangeEnd, views } = ctx;
  return (
    <>
    {isMulti && !selIds.length && (() => {
      const rowsB = flatRows.slice(block.r1, block.r2 + 1);
      const colsB = cols.slice(block.c1, block.c2 + 1);
      let filled = 0;
      const unique = new Set();
      const statuses = new Map();
      rowsB.forEach((t) => {
        const v = views.get(t.id);
        colsB.forEach((c) => {
          const val = String((c.key === "owner" ? v.ownerText : v[c.key]) ?? "");
          if (val) {
            filled += 1;
            unique.add(val);
          }
          if (c.key === "status" && t.status) statuses.set(t.status, (statuses.get(t.status) || 0) + 1);
        });
      });
      const count = rowsB.length * colsB.length;
      return (
        <RangeSelectionBar
          stats={{
            rows: rowsB.length,
            cols: colsB.length,
            count,
            filled,
            empty: count - filled,
            unique: unique.size,
            times: [],
            statusCounts: [...statuses.entries()],
            block,
          }}
          left={(gridRef.current?.getBoundingClientRect().left || 0) + 16}
          onCopy={copyBlock}
          onClear={() => setRangeEnd(null)}
        />
      );
    })()}
    </>
  );
}
