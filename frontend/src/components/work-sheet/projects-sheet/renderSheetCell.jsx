import { Avatar, StatusBadge } from "@/components/work-sheet/projects-sheet/SheetBits";
import { C, MENU } from "@/components/work-sheet/projects-sheet/sheetTheme";
import { ChevronsUpDown, Maximize2 } from "lucide-react";
import { DATE_FIELD } from "@/components/work-sheet/projects-sheet/sheetColumns";
import { ExpandEditor } from "@/components/work-sheet/projects-sheet/SheetPickers";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { pickerFor } from "@/components/work-sheet/projects-sheet/renderPicker";

export function renderSheetCell(ctx, t, v, col, ri, ci) {
  const { block, canEdit, cell, commitText, dragSelRef, editing, fillIdx, fillRef, finishEdit, focusGrid, isMulti, menu, noteFor, save, saveNote, sel, setCell, setEditing, setFillTo, setMenu, setRangeEnd, startEdit } = ctx;
  const isAct = cell?.r === t.id && cell?.c === col.key;
  const isEditing = editing?.r === t.id && editing?.c === col.key;
  const frozen = col.left != null;
  const raw = col.key === "owner" ? v.ownerText : v[col.key];
  const text = raw == null ? "" : String(raw);
  const empty = !text;
  const caret = ["select", "people"].includes(col.kind) && !isEditing;
  const showExpand =
    !isEditing && col.long && (isAct || (!empty && text.length > col.long));
  const menuOpen = menu?.r === t.id && menu?.c === col.key;
  const muted = col.kind === "ro" || col.key === "date";
  const inBlock = isMulti && ri >= block.r1 && ri <= block.r2 && ci >= block.c1 && ci <= block.c2;
  const inFill =
    fillIdx >= 0 &&
    ci >= block.c1 &&
    ci <= block.c2 &&
    ((fillIdx > block.r2 && ri > block.r2 && ri <= fillIdx) || (fillIdx < block.r1 && ri < block.r1 && ri >= fillIdx));
  // The fill handle sits on the bottom-right corner of the selection.
  const showFill = canEdit && !editing && !!block && ri === block.r2 && ci === block.c2;
  return (
    <div
      key={col.key}
      role="gridcell"
      data-cell={`${t.id}:${col.key}`}
      aria-selected={isAct}
      title={empty || isEditing ? undefined : text}
      onMouseDown={(e) => {
        // Ignore clicks inside this cell's menu (it is portalled, but React
        // still bubbles its events here).
        if (isEditing || !e.currentTarget.contains(e.target)) return;
        e.preventDefault();
        if (editing) finishEdit(true);
        if (e.shiftKey && cell) {
          // Shift+click: select the block from the active cell to here.
          setRangeEnd({ r: t.id, c: col.key });
          focusGrid();
          return;
        }
        const wasActive = isAct && !isMulti;
        setCell({ r: t.id, c: col.key });
        setRangeEnd(null);
        dragSelRef.current = true;
        focusGrid();
        if (wasActive && ["select", "people", "followup"].includes(col.kind)) startEdit(t.id, col.key);
      }}
      onMouseEnter={() => {
        if (fillRef.current) setFillTo(t.id);
        else if (dragSelRef.current) setRangeEnd({ r: t.id, c: col.key });
      }}
      onDoubleClick={(e) => e.currentTarget.contains(e.target) && startEdit(t.id, col.key)}
      className={frozen ? "bg-white group-hover/row:bg-[#f9fafb]" : ""}
      style={{
        position: frozen ? "sticky" : "relative",
        left: frozen ? col.left : "auto",
        zIndex: frozen ? (showFill ? 3 : 2) : isAct || showFill ? 1 : 0,
        display: "flex",
        alignItems: "center",
        gap: 6,
        minWidth: 0,
        padding: "0 10px",
        ...(frozen && sel[t.id] ? { background: C.b50 } : {}),
        ...(inBlock && !isAct ? { background: "rgba(43,43,181,0.08)" } : {}),
        ...(inFill ? { outline: `1px dashed ${C.b500}`, outlineOffset: -1 } : {}),
        boxShadow: isAct
          ? `inset 0 0 0 2px ${C.b500}`
          : col.edge
            ? `inset -2px 0 0 ${C.edge}, inset 0 -1px 0 ${C.cellLine}`
            : `inset -1px -1px 0 ${C.cellLine}`,
        color: muted ? C.n500 : C.n900,
        fontWeight: col.key === "task" ? 500 : 400,
        cursor: "cell",
      }}
    >
      {showFill && (
        <span
          role="button"
          aria-label="Drag to fill cells"
          title="Drag up or down to fill"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            fillRef.current = true;
            setFillTo(t.id);
          }}
          style={{
            position: "absolute",
            right: -4,
            bottom: -4,
            zIndex: 4,
            width: 8,
            height: 8,
            borderRadius: 2,
            background: C.b500,
            boxShadow: "0 0 0 2px #fff",
            cursor: "ns-resize",
          }}
        />
      )}
      {isEditing && (
        <input
          autoFocus
          aria-label="Edit cell"
          type={col.kind === "date" ? "date" : "text"}
          inputMode={col.kind === "number" ? "numeric" : undefined}
          data-sheet-cell="1"
          data-sheet-row={ri}
          data-sheet-col={ci}
          value={editing.draft}
          onChange={(e) => {
            const draft = e.target.value;
            setEditing((cur) => (cur ? { ...cur, draft } : cur));
          }}
          onFocus={(e) => {
            if (col.kind !== "date") {
              const n = e.target.value.length;
              e.target.setSelectionRange(n, n);
            }
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              finishEdit(true, e.shiftKey ? "up" : "down");
            } else if (e.key === "Tab") {
              e.preventDefault();
              finishEdit(true, e.shiftKey ? "left" : "right");
            } else if (e.key === "Escape") {
              e.preventDefault();
              finishEdit(false);
            }
          }}
          onBlur={() => finishEdit(true)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            padding: "0 10px",
            border: "none",
            outline: "none",
            borderRadius: 0,
            boxShadow: `inset 0 0 0 2px ${C.b500}, 0 3px 6px rgba(13,28,61,0.08)`,
            background: "#fff",
            font: "inherit",
            fontSize: 13,
            color: C.n900,
            textAlign: col.kind === "number" ? "right" : "left",
            zIndex: 3,
          }}
        />
      )}
      {!isEditing && col.key === "owner" && !empty && <Avatar name={v.owner} />}
      {!isEditing && col.key === "status" && !empty && (
        <span style={{ flex: 1, minWidth: 0, display: "flex" }}>
          <StatusBadge status={text} />
        </span>
      )}
      {!isEditing && col.kind === "date" && (
        // Same always-on date input as the other sheets' Date column.
        <Input
          key={t[DATE_FIELD[col.key]] || ""}
          type="date"
          aria-label={col.label}
          defaultValue={t[DATE_FIELD[col.key]] || ""}
          disabled={!canEdit}
          onMouseDown={(e) => {
            e.stopPropagation();
            setCell({ r: t.id, c: col.key });
            setRangeEnd(null);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
          }}
          onBlur={(e) => {
            commitText(t, col.key, e.target.value);
            requestAnimationFrame(focusGrid);
          }}
          className="sheet-date-input h-8 w-[130px] pl-7 pr-1 text-[13px]"
        />
      )}
      {!isEditing && col.key !== "status" && col.kind !== "date" && (
        <span
          style={{
            flex: 1,
            minWidth: 0,
            textAlign: col.kind === "number" || col.kind === "date" ? "right" : "left",
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {text}
        </span>
      )}
      {caret && <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" style={{ color: isAct ? C.b500 : "#94a3b8" }} />}
      {showExpand && (
        <button
          type="button"
          aria-label="Expand cell"
          title="Expand (Ctrl Enter)"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCell({ r: t.id, c: col.key });
            setMenu({ r: t.id, c: col.key, kind: "expand" });
          }}
          className="hover:!bg-[#f0f0fd] hover:!text-[#2b2bb5]"
          style={{
            flexShrink: 0,
            width: 22,
            height: 22,
            border: "none",
            borderRadius: 6,
            background: isAct ? C.b50 : "#fff",
            boxShadow: `inset 0 0 0 1px ${C.cellLine}`,
            color: isAct ? C.b500 : C.n400,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      )}
      {menuOpen && (
        <Popover
          open
          onOpenChange={(o) => {
            if (!o) {
              setMenu(null);
              requestAnimationFrame(focusGrid);
            }
          }}
        >
          <PopoverAnchor asChild>
            <span style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
          </PopoverAnchor>
          <PopoverContent
            align="start"
            sideOffset={2}
            className={`${MENU} ${menu.kind === "expand" ? "w-[380px]" : col.key === "followup" ? "w-[280px]" : "w-[260px]"}`}
            onOpenAutoFocus={(e) => {
              if (!["client", "owner", "followup"].includes(col.key) && menu.kind !== "expand") e.preventDefault();
            }}
          >
            {menu.kind === "expand" ? (
              col.key === "remark" ? (
                <ExpandEditor value={noteFor(t.id)} readOnly={!canEdit} onSave={(note) => saveNote(t, note)} />
              ) : (
                <ExpandEditor value={t.task} readOnly={!canEdit} onSave={(task) => save(t, { task })} />
              )
            ) : (
              pickerFor(ctx, t, col)
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
