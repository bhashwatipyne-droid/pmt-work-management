import { ArrowDown, ArrowUp, Check, ChevronDown, EyeOff, Filter, Hand, Snowflake } from "lucide-react";
import { C, MENU, MENU_ITEM, MENU_LABEL } from "@/components/work-sheet/projects-sheet/sheetTheme";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ValuesPanel } from "@/components/work-sheet/projects-sheet/SheetPickers";

export function renderHeaderCell(ctx, col) {
  const { cell, dragCol, filters, frozenThrough, headMenu, ranges, setCell, setDragCol, setFilters, setFrozenThrough, setHeadMenu, setHiddenCols, setOrder, setRanges, setSort, sort, startResize, toggleFilter, valuesFor } = ctx;
  const sorted = sort?.key === col.key;
  const range = ranges[col.key];
  const filtered = (col.filter && filters[col.filter]?.length) || !!(range?.from || range?.to);
  const Icon = sorted ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : filtered ? Filter : ChevronDown;
  const frozen = col.left != null;
  return (
    <Popover key={col.key} open={headMenu === col.key} onOpenChange={(o) => setHeadMenu(o ? col.key : null)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-haspopup="menu"
          title={`Sort and filter ${col.label} · drag to move`}
          draggable
          onDragStart={(e) => {
            setDragCol(col.key);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => dragCol && dragCol !== col.key && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!dragCol || dragCol === col.key) return;
            setOrder((o) => {
              const after = o.indexOf(dragCol) < o.indexOf(col.key);
              const next = o.filter((k) => k !== dragCol);
              next.splice(next.indexOf(col.key) + (after ? 1 : 0), 0, dragCol);
              return next;
            });
            setDragCol(null);
          }}
          onDragEnd={() => setDragCol(null)}
          className="group/head hover:!text-[#0d1b3e]"
          style={{
            position: frozen ? "sticky" : "relative",
            left: frozen ? col.left : "auto",
            zIndex: frozen ? 3 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
            padding: "0 10px",
            border: "none",
            borderRadius: 0,
            background: sorted || filtered ? C.b50 : C.head,
            boxShadow: col.edge
              ? `inset -2px 0 0 ${C.edge}, inset 0 -1px 0 ${C.line}`
              : `inset -1px -1px 0 ${C.line}`,
            color: sorted || filtered ? C.b700 : "#0f172a",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
            textAlign: "left",
          }}
        >
          <span className="flex min-w-0 flex-1 items-center justify-center gap-1" style={{ opacity: dragCol === col.key ? 0.5 : 1 }}>
            <Hand className="h-3 w-3 shrink-0 cursor-grab opacity-0 group-hover/head:opacity-100" />
            <span className="truncate">{col.label}</span>
          </span>
          <Icon className="h-3 w-3 shrink-0 text-slate-400" />
          <span
            role="separator"
            aria-label={`Resize ${col.label}`}
            title="Drag to resize column"
            draggable={false}
            onMouseDown={(e) => startResize(e, col.key, col.w)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="group/resize absolute right-0 top-0 z-[5] flex h-full w-2 cursor-col-resize justify-center"
          >
            <span className="h-full w-px bg-transparent group-hover/resize:bg-[#8a97b5]" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={2} className={MENU}>
        <div className="flex flex-col gap-px p-1.5" style={{ boxShadow: `inset 0 -1px 0 ${C.cellLine}` }}>
          <div className={MENU_LABEL}>Sort {col.label}</div>
          {[
            ["asc", "Sort A → Z", ArrowUp],
            ["desc", "Sort Z → A", ArrowDown],
          ].map(([dir, label, I]) => {
            const on = sort?.key === col.key && sort.dir === dir;
            return (
              <button
                key={dir}
                type="button"
                onClick={() => {
                  setSort(on ? null : { key: col.key, dir });
                  if (!col.filter) setHeadMenu(null);
                }}
                className={MENU_ITEM}
                style={on ? { background: C.b50, color: C.b700 } : undefined}
              >
                <I className="h-3.5 w-3.5" />
                <span className="flex-1">{label}</span>
                {on && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-px p-1.5" style={{ boxShadow: `inset 0 -1px 0 ${C.cellLine}` }}>
          <button
            type="button"
            className={MENU_ITEM}
            onClick={() => {
              setFrozenThrough(frozenThrough === col.key ? null : col.key);
              setHeadMenu(null);
            }}
          >
            <Snowflake className="h-3.5 w-3.5" />
            <span className="flex-1">{frozenThrough === col.key ? "Unfreeze columns" : "Freeze up to this column"}</span>
          </button>
          {col.key !== "task" && (
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setHiddenCols((h) => [...h, col.key]);
                if (frozenThrough === col.key) setFrozenThrough(null);
                if (cell?.c === col.key) setCell(null);
                setHeadMenu(null);
              }}
            >
              <EyeOff className="h-3.5 w-3.5" />
              <span className="flex-1">Hide column</span>
            </button>
          )}
        </div>
        {col.kind === "date" && (
          <div className="flex flex-col gap-2 p-2.5" style={{ boxShadow: `inset 0 -1px 0 ${C.cellLine}` }}>
            <div className="flex items-center gap-2 font-semibold">
              <Filter className="h-3.5 w-3.5" />
              Filter by date
            </div>
            <div className="flex gap-2">
              {[
                ["from", "From"],
                ["to", "To"],
              ].map(([k, label]) => (
                <label key={k} className="flex min-w-0 flex-1 flex-col gap-1 text-[12px] text-[#546490]">
                  {label}
                  <input
                    type="date"
                    value={range?.[k] || ""}
                    onChange={(e) => setRanges((r) => ({ ...r, [col.key]: { ...r[col.key], [k]: e.target.value } }))}
                    className="h-8 w-full rounded-[7px] border-0 px-2 text-[13px] text-[#0d1b3e] outline-none"
                    style={{ boxShadow: `inset 0 0 0 1px ${C.n200}` }}
                  />
                </label>
              ))}
            </div>
            {(range?.from || range?.to) && (
              <button
                type="button"
                onClick={() => setRanges((r) => ({ ...r, [col.key]: {} }))}
                className="self-start text-[12px] font-medium text-[#2b2bb5] hover:underline"
              >
                Clear dates
              </button>
            )}
          </div>
        )}
        {col.filter && (
          <ValuesPanel
            title={col.label}
            values={valuesFor(col.filter)}
            selected={filters[col.filter] || []}
            onToggle={(v) => toggleFilter(col.filter, v)}
            onClear={() => setFilters((f) => ({ ...f, [col.filter]: [] }))}
            onDone={() => setHeadMenu(null)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}
