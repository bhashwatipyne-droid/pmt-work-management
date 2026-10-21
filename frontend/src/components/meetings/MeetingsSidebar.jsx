import { calStyle, timeLabel } from "@/components/meetings/meetingsLogic";

export function MeetingsSidebar(ctx) {
  const { calendars, hidden, now, setHidden, upcoming } = ctx;
  return (
    <>
    <aside className="hidden w-[220px] shrink-0 flex-col gap-5 border-r border-[#eaeef4] px-4 py-4 lg:flex">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#546490]">Calendars</p>
        {calendars.map(({ calendar, event_count }) => {
          const s = calStyle(calendar);
          const on = !hidden.has(calendar);
          return (
            <label key={calendar} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-[#f5f6fb]">
              <input
                type="checkbox"
                checked={on}
                onChange={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    on ? next.add(calendar) : next.delete(calendar);
                    return next;
                  })
                }
                className="sr-only"
              />
              <span
                aria-hidden
                className="grid h-4 w-4 place-items-center rounded-[4px] border-2 text-[10px] font-bold text-white"
                style={{ borderColor: s.dot, background: on ? s.dot : "transparent" }}
              >
                {on ? "✓" : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-[#0d1b3e]">{s.label}</span>
                <span className="block truncate text-[11px] text-[#94a0bf]">{calendar}</span>
              </span>
              {event_count != null && <span className="text-[11px] tabular-nums text-[#94a0bf]">{event_count}</span>}
            </label>
          );
        })}
      </div>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[#546490]">Still to come today</p>
        {upcoming.length ? (
          <ul className="flex flex-col gap-2">
            {upcoming.map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: calStyle(e.calendars[0]).dot }} />
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-[#0d1b3e]">{e.summary}</span>
                  <span className="block text-[11px] text-[#94a0bf]">
                    {timeLabel(e.startDate)}
                    {e.client ? ` · ${e.client.name}` : ""}
                  </span>
                  {e.meet_link && e.startDate - now < 15 * 6e4 && (
                    <a href={e.meet_link} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-[#2b2bb5] hover:underline">
                      Join now
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-[#94a0bf]">Nothing else today.</p>
        )}
      </div>
    </aside>
    </>
  );
}
