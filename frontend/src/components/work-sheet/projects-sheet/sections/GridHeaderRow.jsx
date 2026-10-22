import { C } from "@/components/work-sheet/projects-sheet/sheetTheme";
import { Checkbox } from "@/components/work-sheet/projects-sheet/SheetBits";

export function GridHeaderRow(ctx) {
  const { GRID, allVisSel, cols, headerCell, setSel, someVisSel, visIds } = ctx;
  return (
    <>
    <div
      role="row"
      style={{
        display: "grid",
        gridTemplateColumns: GRID,
        height: 40,
        position: "sticky",
        top: 0,
        zIndex: 4,
        background: C.head,
      }}
    >
      <span
        style={{
          position: "sticky",
          left: 0,
          zIndex: 3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: C.head,
          boxShadow: `inset -1px -1px 0 ${C.line}`,
        }}
      >
        <Checkbox
          on={allVisSel}
          partial={someVisSel}
          label="Select all rows"
          onClick={() =>
            setSel((s) => {
              const next = { ...s };
              visIds.forEach((id) => (next[id] = !allVisSel));
              return next;
            })
          }
        />
      </span>
      {cols.map(headerCell)}
    </div>
    </>
  );
}
