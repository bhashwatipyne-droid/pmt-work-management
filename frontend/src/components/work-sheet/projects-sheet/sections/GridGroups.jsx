import { Avatar, Checkbox } from "@/components/work-sheet/projects-sheet/SheetBits";
import { C } from "@/components/work-sheet/projects-sheet/sheetTheme";
import { ChevronDown, ChevronRight } from "lucide-react";

export function GridGroups(ctx) {
  const { GRID, canEdit, cell, checkDragRef, collapsed, cols, dropAt, dropRows, flatRows, focusGrid, groupBy, groups, loading, renderCell, rowDrag, sel, selIds, setCell, setCollapsed, setDropAt, setRowDrag, setSel, sort, toggleRow, views } = ctx;
  return (
    <>
    {!loading &&
      groups.map((g) => {
        const open = !collapsed[g.key];
        const delayed = g.rows.filter((t) => t.status === "Delayed" || views.get(t.id).late > 0).length;
        return (
          <div role="rowgroup" key={g.key}>
            {groupBy !== "none" && (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setCollapsed((c) => ({ ...c, [g.key]: open }))}
                className="block w-full text-left hover:bg-[#f7f9fc]"
                style={{ height: 40, padding: 0, border: "none", background: C.head, boxShadow: `inset 0 -1px 0 ${C.line}` }}
              >
                <span
                  style={{
                    position: "sticky",
                    left: 0,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    height: 40,
                    padding: "0 12px",
                  }}
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  )}
                  {groupBy === "owner" ? (
                    <Avatar name={g.name} size={24} fontSize={10} />
                  ) : (
                    <span style={{ width: 8, height: 8, borderRadius: 9999, background: C.n400 }} />
                  )}
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{g.name}</span>
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      fontSize: 13,
                      color: "#64748b",
                    }}
                  >
                    {g.rows.length} {g.rows.length === 1 ? "row" : "rows"}
                    {delayed ? ` · ${delayed} delayed` : ""}
                  </span>
                </span>
              </button>
            )}
            {open &&
              g.rows.map((t) => {
                const v = views.get(t.id);
                const ri = flatRows.indexOf(t);
                const isSel = !!sel[t.id];
                const rowAct = cell?.r === t.id;
                return (
                  <div
                    key={t.id}
                    role="row"
                    data-rowid={t.id}
                    onDragOver={(e) => {
                      if (!rowDrag) return;
                      e.preventDefault();
                      const box = e.currentTarget.getBoundingClientRect();
                      const pos = e.clientY < box.top + box.height / 2 ? "above" : "below";
                      if (dropAt?.id !== t.id || dropAt?.pos !== pos) setDropAt({ id: t.id, pos });
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dropAt) dropRows(dropAt.id, dropAt.pos);
                    }}
                    aria-selected={isSel}
                    className={`group/row ${isSel ? "" : "hover:bg-[#f9fafb]"}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: GRID,
                      height: 52,
                      background: isSel ? C.b50 : "#fff",
                      fontSize: 13,
                      lineHeight: "18px",
                      position: "relative",
                      zIndex: 0,
                    }}
                  >
                    <span
                      onMouseDown={(e) => {
                        e.preventDefault();
                        if (!e.shiftKey) checkDragRef.current = { on: !sel[t.id] };
                        toggleRow(t.id, e.shiftKey);
                        setCell((c) => ({ r: t.id, c: c?.c || cols[0]?.key }));
                        focusGrid();
                      }}
                      onMouseEnter={() => {
                        const drag = checkDragRef.current;
                        if (drag) setSel((cur) => ({ ...cur, [t.id]: drag.on }));
                      }}
                      title="Click, drag or Shift+click to select several"
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        paddingLeft: 14,
                        boxSizing: "border-box",
                        background: rowAct ? C.b100 : isSel ? C.b50 : C.n50,
                        boxShadow: `inset -1px -1px 0 ${C.line}`,
                        cursor: "pointer",
                      }}
                    >
                      {canEdit && !sort && (
                        <span
                          role="button"
                          aria-label="Drag to move row"
                          title="Drag to move. Selected rows move together."
                          draggable
                          onMouseDown={(e) => e.stopPropagation()}
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", t.id);
                            setRowDrag(isSel ? selIds : [t.id]);
                          }}
                          onDragEnd={() => {
                            setRowDrag(null);
                            setDropAt(null);
                          }}
                          className="hover:!bg-[#f5f6f8] hover:!text-[#4a5878]"
                          style={{
                            position: "absolute",
                            left: 2,
                            top: 8,
                            width: 14,
                            height: 24,
                            borderRadius: 4,
                            display: "grid",
                            gridTemplateColumns: "repeat(2, 3px)",
                            gridAutoRows: "3px",
                            gap: 2,
                            alignContent: "center",
                            justifyContent: "center",
                            color: C.n300,
                            cursor: "grab",
                          }}
                        >
                          {[0, 1, 2, 3, 4, 5].map((k) => (
                            <span key={k} style={{ borderRadius: 9999, background: "currentColor" }} />
                          ))}
                        </span>
                      )}
                      <Checkbox on={isSel} label="Select row" />
                    </span>
                    {dropAt?.id === t.id && (
                      <span
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          [dropAt.pos === "above" ? "top" : "bottom"]: -1,
                          height: 2,
                          background: C.b500,
                          zIndex: 6,
                          pointerEvents: "none",
                        }}
                      />
                    )}
                    {cols.map((col, ci) => renderCell(t, v, col, ri, ci))}
                  </div>
                );
              })}
          </div>
        );
      })}
    </>
  );
}
