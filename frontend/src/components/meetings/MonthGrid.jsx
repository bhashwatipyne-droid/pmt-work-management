import { EventChip } from "./EventChip";
import { WEEKDAYS, addDays, sameDay, startOfWeek } from "./meetingsLogic";

export function MonthGrid({ anchor, events, now, onPickDay }) {
  const start = startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const MAX = 3;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-[#e7eaf2]">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-[#546490]">
            {w}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-y-auto">
        {days.map((d) => {
          const inMonth = d.getMonth() === anchor.getMonth();
          const dayEvents = events
            .filter((e) => e.startDate < addDays(d, 1) && e.endDate > d)
            .sort((a, b) => Number(b.all_day) - Number(a.all_day) || a.startDate - b.startDate);
          return (
            <div key={d} className={`flex min-h-[96px] min-w-0 flex-col gap-0.5 border-b border-r border-[#eef0f6] p-1 ${inMonth ? "" : "bg-[#fafbfd]"}`}>
              <button
                type="button"
                onClick={() => onPickDay(d)}
                className={`mx-auto grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12px] ${
                  sameDay(d, now) ? "bg-[#2b2bb5] font-semibold text-white" : inMonth ? "text-[#0d1b3e] hover:bg-[#f0f0fd]" : "text-[#b4bccf]"
                }`}
              >
                {d.getDate()}
              </button>
              {dayEvents.slice(0, MAX).map((e) => (
                <EventChip key={e.id} ev={e} compact className="py-px" />
              ))}
              {dayEvents.length > MAX && (
                <button type="button" onClick={() => onPickDay(d)} className="px-1 text-left text-[11px] font-semibold text-[#546490] hover:text-[#0d1b3e]">
                  {dayEvents.length - MAX} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
