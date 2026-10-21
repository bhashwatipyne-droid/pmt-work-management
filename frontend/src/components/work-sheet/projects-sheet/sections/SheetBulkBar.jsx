import { BADGE, C, MENU, MENU_ITEM, STATUS_BADGE } from "@/components/work-sheet/projects-sheet/sheetTheme";
import { Check, ChevronDown, Copy, EyeOff, Trash2, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function SheetBulkBar(ctx) {
  const { bulkDuplicate, bulkStatus, canEdit, cell, options, selIds, setCell, setConfirmDelete, setHiddenRows, setSel, setStatusMenu, statusMenu } = ctx;
  return (
    <>
    {selIds.length > 0 && canEdit && (
      <div
        role="toolbar"
        aria-label="Row actions"
        className="absolute bottom-5 left-1/2 z-[46] flex w-max max-w-[calc(100%-32px)] -translate-x-1/2 flex-wrap items-center justify-center gap-0.5 whitespace-nowrap rounded-[12px] p-1.5 text-[13px] text-white"
        style={{ background: C.n900, boxShadow: "0 6px 25px rgba(13,28,61,0.2)" }}
      >
        <span
          className="mr-1 flex h-8 items-center gap-1.5 pl-2 pr-3"
          style={{ boxShadow: "inset -1px 0 0 rgb(56,66,84)" }}
        >
          <span
            className="h-5 min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5"
            style={{ background: C.b500 }}
          >
            {selIds.length}
          </span>
          <span className="font-medium" style={{ color: "rgb(200,213,240)" }}>
            {selIds.length === 1 ? "row selected" : "rows selected"}
          </span>
        </span>
        <button
          type="button"
          onClick={bulkDuplicate}
          className="flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium hover:bg-[rgb(36,46,61)]"
        >
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </button>
        <Popover open={statusMenu} onOpenChange={setStatusMenu}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-haspopup="menu"
              className="flex h-8 items-center gap-1.5 rounded-[7px] pl-2.5 pr-2 text-[12px] font-medium hover:bg-[rgb(36,46,61)]"
            >
              <Check className="h-3.5 w-3.5" />
              Apply status
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="start" sideOffset={10} className={`${MENU} w-[200px]`}>
            <div className="flex flex-col gap-px p-1.5">
              {(options.statuses || []).map((s) => (
                <button key={s} type="button" onClick={() => bulkStatus(s)} className={MENU_ITEM}>
                  <span
                    style={{ width: 8, height: 8, borderRadius: 9999, background: BADGE[STATUS_BADGE[s] || "Neutral"].dot }}
                  />
                  {s}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <button
          type="button"
          onClick={() => {
            setHiddenRows((h) => ({ ...h, ...Object.fromEntries(selIds.map((id) => [id, true])) }));
            setSel({});
            if (cell && selIds.includes(cell.r)) setCell(null);
          }}
          className="flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium hover:bg-[rgb(36,46,61)]"
        >
          <EyeOff className="h-3.5 w-3.5" />
          Hide
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium hover:bg-[rgba(239,68,68,0.18)]"
          style={{ color: "rgb(252,165,165)" }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
        <span className="mx-1 h-5 w-px" style={{ background: "rgb(56,66,84)" }} />
        <button
          type="button"
          aria-label="Clear selection"
          onClick={() => setSel({})}
          className="flex h-7 w-7 items-center justify-center rounded-[7px] hover:bg-[rgb(36,46,61)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )}
    </>
  );
}
