import { C } from "@/components/work-sheet/projects-sheet/sheetTheme";

export function GridSkeleton(ctx) {
  const { GRID, cols, loading } = ctx;
  return (
    <>
    {loading &&
      Array.from({ length: 14 }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{ display: "grid", gridTemplateColumns: GRID, height: 40 }}
        >
          <span style={{ background: C.n50, boxShadow: `inset -1px -1px 0 ${C.line}` }} />
          {cols.map((c, j) => (
            <span
              key={c.key}
              className="flex items-center px-2.5"
              style={{ boxShadow: `inset -1px -1px 0 ${C.cellLine}` }}
            >
              <span
                className="h-3 animate-pulse rounded bg-slate-200/70"
                style={{ width: `${[70, 85, 55, 65, 75, 60, 80][(i + j) % 7]}%` }}
              />
            </span>
          ))}
        </div>
      ))}
    </>
  );
}
