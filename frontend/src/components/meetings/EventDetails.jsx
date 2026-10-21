import { ExternalLink, MapPin, Users, Video } from "lucide-react";
import { RESPONSE, calStyle, fmt, plainText, timeLabel } from "./meetingsLogic";

export function EventDetails({ ev }) {
  const when = ev.all_day
    ? `${fmt(ev.startDate, { weekday: "long", day: "numeric", month: "long" })} · All day`
    : `${fmt(ev.startDate, { weekday: "long", day: "numeric", month: "long" })} · ${timeLabel(ev.startDate)} – ${timeLabel(ev.endDate)}`;
  const description = plainText(ev.description);
  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      <div>
        <h3 className="text-[16px] font-semibold leading-snug text-[#0d1b3e]">{ev.summary}</h3>
        <p className="mt-0.5 text-[13px] text-[#546490]">{when}</p>
        {ev.recurring && <p className="text-[12px] text-[#94a0bf]">Repeats</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ev.calendars.map((c) => {
          const s = calStyle(c);
          return (
            <span key={c} className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: s.bg, color: s.text }}>
              <span className="h-2 w-2 rounded-full" style={{ background: s.dot }} />
              {s.label}
            </span>
          );
        })}
        {ev.client && (
          <span className="rounded-full bg-[#f0f0fd] px-2 py-0.5 text-[11px] font-semibold text-[#1a1a8a]">{ev.client.name}</span>
        )}
      </div>
      {ev.meet_link && (
        <a
          href={ev.meet_link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-2 rounded-md bg-[#2b2bb5] px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-[#23239a]"
        >
          <Video className="h-4 w-4" /> Join meeting
        </a>
      )}
      {ev.location && (
        <p className="flex items-start gap-2 text-[13px] text-[#0d1b3e]">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#94a0bf]" />
          <span className="min-w-0 break-words">{ev.location}</span>
        </p>
      )}
      {ev.attendees?.length > 0 && (
        <div>
          <p className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-[#546490]">
            <Users className="h-3.5 w-3.5" /> {ev.attendees.length} guest{ev.attendees.length === 1 ? "" : "s"}
          </p>
          <ul className="flex flex-col gap-0.5">
            {ev.attendees.map((a) => (
              <li key={a.email} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="min-w-0 truncate text-[#0d1b3e]">
                  {a.name || a.email}
                  {a.organizer && <span className="text-[#94a0bf]"> · organiser</span>}
                </span>
                <span className={`shrink-0 ${a.response === "declined" ? "text-rose-600" : "text-[#94a0bf]"}`}>
                  {RESPONSE[a.response] || ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {description && (
        <p className="whitespace-pre-wrap break-words border-t border-[#eef0f6] pt-2 text-[12px] leading-5 text-[#334155]">
          {description}
        </p>
      )}
      {ev.html_link && (
        <a href={ev.html_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2b2bb5] hover:underline">
          Open in Google Calendar <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

