import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// "2026-09" <-> { year, month (0-11) }. "" means every month.
const parse = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(value || "");
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : null;
};

const format = (year, month) => `${year}-${String(month + 1).padStart(2, "0")}`;

export const monthLabel = (value) => {
  const parsed = parse(value);
  return parsed ? `${MONTH_NAMES[parsed.month]} ${parsed.year}` : "All months";
};

// Month stepper for the Work Sheet header: arrows go to the previous / next
// month, and clicking the label opens a year + month grid (with "All months").
export function MonthPicker({ value, onChange, currentMonth }) {
  const [open, setOpen] = useState(false);
  const selected = parse(value);
  const today = parse(currentMonth);
  const [viewYear, setViewYear] = useState((selected || today || { year: new Date().getFullYear() }).year);

  const step = (delta) => {
    const from = selected || today;
    if (!from) return;
    const index = from.year * 12 + from.month + delta;
    onChange(format(Math.floor(index / 12), ((index % 12) + 12) % 12));
  };

  const pick = (next) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div
      role="group"
      aria-label="Month"
      data-testid="worksheet-month-picker"
      className="inline-flex h-8 items-center rounded-[7px] bg-white shadow-[inset_0_0_0_1px_#eff0f2]"
    >
      <button
        type="button"
        aria-label="Previous month"
        onClick={() => step(-1)}
        className="flex h-full w-8 items-center justify-center rounded-l-[7px] text-[#4a5878] transition-colors hover:bg-[#f9fafb]"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setViewYear((selected || today || { year: viewYear }).year);
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Month: ${monthLabel(value)}. Choose a month`}
            data-testid="worksheet-month-label"
            className="flex h-full min-w-[132px] items-center justify-center gap-1.5 px-2 text-[13px] font-medium text-[#0d1b3e] transition-colors hover:bg-[#f9fafb]"
          >
            <CalendarDays className="h-3.5 w-3.5 text-slate-500" />
            {monthLabel(value)}
          </button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-[248px] p-3">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous year"
              onClick={() => setViewYear((year) => year - 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-foreground">{viewYear}</span>
            <button
              type="button"
              aria-label="Next year"
              onClick={() => setViewYear((year) => year + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            {MONTH_NAMES.map((name, index) => {
              const isSelected = selected?.year === viewYear && selected.month === index;
              const isToday = today?.year === viewYear && today.month === index;

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => pick(format(viewYear, index))}
                  aria-pressed={isSelected}
                  className={`h-8 rounded-md text-[13px] transition-colors ${
                    isSelected
                      ? "bg-[#2b2bb5] font-semibold text-white"
                      : `text-foreground hover:bg-[#f0f0fd] ${
                          isToday ? "font-semibold text-[#2b2bb5] ring-1 ring-inset ring-[#dcdcf8]" : ""
                        }`
                  }`}
                >
                  {name.slice(0, 3)}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              onClick={() => pick("")}
              className={`h-7 rounded-md px-2 text-xs font-semibold hover:bg-[#f0f0fd] ${
                value ? "text-[#2b2bb5]" : "text-muted-foreground"
              }`}
            >
              All months
            </button>
            {currentMonth && (
              <button
                type="button"
                onClick={() => pick(currentMonth)}
                className="h-7 rounded-md px-2 text-xs font-semibold text-[#2b2bb5] hover:bg-[#f0f0fd]"
              >
                This month
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        aria-label="Next month"
        onClick={() => step(1)}
        className="flex h-full w-8 items-center justify-center rounded-r-[7px] text-[#4a5878] transition-colors hover:bg-[#f9fafb]"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}