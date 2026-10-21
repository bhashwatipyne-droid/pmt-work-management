import { useLayoutEffect, useRef } from "react";
import { EventChip } from "./EventChip";
import { FIRST_HOUR, HOUR_PX, WEEKDAYS, addDays, hourLabel, layoutDay, sameDay } from "./meetingsLogic";

export function TimeGrid({ days, events, now }) {
  const scrollRef = useRef(null);
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = FIRST_HOUR * HOUR_PX - 8;
  }, []);
  const allDay = events.filter((e) => e.all_day || e.endDate - e.startDate >= 24 * 36e5);
  const timed = events.filter((e) => !allDay.includes(e));
  const cols = `56px repeat(${days.length}, minmax(0, 1fr))`;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid border-b border-[#e7eaf2]" style={{ gridTemplateColumns: cols }}>
        <div />
        {days.map((d) => {
          const today = sameDay(d, now);
          return (
            <div key={d} className="flex flex-col items-center py-2">
              <span className={`text-[11px] font-semibold uppercase tracking-wide ${today ? "text-[#2b2bb5]" : "text-[#546490]"}`}>
                {WEEKDAYS[(d.getDay() + 6) % 7]}
              </span>
              <span
                className={`mt-0.5 grid h-9 w-9 place-items-center rounded-full text-[20px] ${
                  today ? "bg-[#2b2bb5] font-semibold text-white" : "text-[#0d1b3e]"
                }`}
              >
                {d.getDate()}
              </span>
            </div>
          );
        })}
        {allDay.length > 0 && (
          <>
            <div className="self-center pr-2 text-right text-[10px] text-[#94a0bf]">All day</div>
            {days.map((d) => (
              <div key={d} className="flex min-h-6 flex-col gap-0.5 border-l border-[#eef0f6] p-0.5">
                {allDay
                  .filter((e) => e.startDate < addDays(d, 1) && e.endDate > d)
                  .map((e) => (
                    <EventChip key={`${e.id}-${d}`} ev={e} compact className="py-0.5" />
                  ))}
              </div>
            ))}
          </>
        )}
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: cols, height: 24 * HOUR_PX }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) =>
              h ? (
                <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-[#94a0bf]" style={{ top: h * HOUR_PX }}>
                  {hourLabel(h)}
                </span>
              ) : null
            )}
          </div>
          {days.map((d) => {
            const next = addDays(d, 1);
            const placed = layoutDay(timed.filter((e) => e.startDate < next && e.endDate > d));
            return (
              <div
                key={d}
                className="relative border-l border-[#eef0f6]"
                style={{ backgroundImage: `repeating-linear-gradient(to bottom, #eef0f6 0 1px, transparent 1px ${HOUR_PX}px)` }}
              >
                {placed.map(({ ev, col, cols: n }) => {
                  const from = Math.max(ev.startDate, d);
                  const to = Math.min(ev.endDate, next);
                  const top = ((from - d) / 36e5) * HOUR_PX;
                  const height = Math.max(18, ((to - from) / 36e5) * HOUR_PX - 2);
                  return (
                    <EventChip
                      key={ev.id}
                      ev={ev}
                      compact={height < 34}
                      className="absolute py-0.5 shadow-[0_0_0_1px_#fff]"
                      style={{ top, height, left: `calc(${(col / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}
                    />
                  );
                })}
                {sameDay(d, now) && (
                  <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: ((now - d) / 36e5) * HOUR_PX }}>
                    <div className="relative h-[2px] bg-[#e5484d]">
                      <span className="absolute -left-1 -top-[4px] h-2.5 w-2.5 rounded-full bg-[#e5484d]" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
