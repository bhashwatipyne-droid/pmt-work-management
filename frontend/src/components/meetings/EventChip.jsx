import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EventDetails } from "./EventDetails";
import { calStyle, timeLabel } from "./meetingsLogic";

export function EventChip({ ev, className = "", style, compact = false }) {
  const s = calStyle(ev.calendars[0]);
  const declined = ev.my_response === "declined";
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          style={{ background: s.bg, color: s.text, borderLeft: `3px solid ${s.dot}`, ...style }}
          className={`overflow-hidden rounded-[5px] px-1.5 text-left text-[11px] leading-[14px] outline-none hover:brightness-95 focus-visible:ring-2 focus-visible:ring-[#2b2bb5] ${
            declined ? "line-through opacity-60" : ""
          } ${className}`}
          title={ev.summary}
        >
          {compact ? (
            <span className="block truncate">
              {!ev.all_day && <span className="opacity-75">{timeLabel(ev.startDate)} </span>}
              <span className="font-semibold">{ev.summary}</span>
            </span>
          ) : (
            <>
              <span className="block truncate font-semibold">{ev.summary}</span>
              {!ev.all_day && (
                <span className="block truncate opacity-80">
                  {timeLabel(ev.startDate)} – {timeLabel(ev.endDate)}
                </span>
              )}
              {ev.calendars.length > 1 && (
                <span className="mt-0.5 flex gap-0.5">
                  {ev.calendars.map((c) => (
                    <span key={c} className="h-1.5 w-1.5 rounded-full" style={{ background: calStyle(c).dot }} />
                  ))}
                </span>
              )}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] p-4">
        <EventDetails ev={ev} />
      </PopoverContent>
    </Popover>
  );
}
