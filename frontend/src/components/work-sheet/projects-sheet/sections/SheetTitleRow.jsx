import { ChevronDown, History, Plus } from "lucide-react";
import { MENU, MENU_ITEM } from "@/components/work-sheet/projects-sheet/sheetTheme";
import { MonthPicker } from "@/components/work-sheet/MonthPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PopoverClose } from "@radix-ui/react-popover";

export function SheetTitleRow(ctx) {
  const { addRow, addRows, addingRows, canEdit, setHistoryOpen, setMonth, setPickedDay, today, viewMonth } = ctx;
  return (
    <>
    <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-4 md:gap-3 md:px-5 md:pt-5">
      <h1 className="min-w-[120px] flex-1 text-xl font-semibold tracking-tight text-[#0d1b3e] md:min-w-[160px] md:text-2xl">
        Work sheet
      </h1>
      <MonthPicker
        value={viewMonth}
        allowAll={false}
        onChange={(m) => {
          setMonth(m || null);
          setPickedDay(null);
        }}
        currentMonth={today.slice(0, 7)}
        maxMonth={today.slice(0, 7)}
      />
      <button
        type="button"
        onClick={() => setHistoryOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[7px] bg-[#f5f6f8] px-3.5 text-[13px] font-semibold text-[#4a5878] shadow-[inset_0_0_0_1px_#eff0f2] hover:bg-[#eef0f3]"
      >
        <History className="h-3.5 w-3.5" />
        History
      </button>
      {canEdit && (
        <div className="inline-flex h-8">
          <button
            type="button"
            onClick={addRow}
            disabled={addingRows}
            className="inline-flex h-8 items-center gap-1.5 rounded-l-[7px] bg-[#2b2bb5] px-3.5 text-[13px] font-semibold text-white hover:bg-[#3d3dcc] disabled:opacity-70"
          >
            <Plus className="h-3.5 w-3.5" /> {addingRows ? "Adding rows..." : "Add row"}
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Add multiple rows"
                disabled={addingRows}
                className="inline-flex h-8 items-center rounded-r-[7px] border-l border-white/20 bg-[#2b2bb5] px-2 text-white hover:bg-[#3d3dcc] disabled:opacity-70"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={4} className={`${MENU} w-[180px]`}>
              <div className="flex flex-col gap-px p-1.5">
                {[1, 5, 10, 20].map((n) => (
                  <PopoverClose key={n} asChild>
                    <button type="button" onClick={() => addRows(n)} className={MENU_ITEM}>
                      Add {n} row{n === 1 ? "" : "s"}
                    </button>
                  </PopoverClose>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
    </>
  );
}
