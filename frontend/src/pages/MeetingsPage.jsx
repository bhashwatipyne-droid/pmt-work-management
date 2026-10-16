import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, MapPin, RefreshCw, Users, Video } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useUser } from "@/context/UserContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getMeetings, getMeetingsStatus, syncMeetingsNow } from "@/services/api";

// Meetings: the company calendars (content@, projects@, product@, animate@) in a Google
// Calendar style Day / Week / Month view. Read-only: the events come from
// Google every ~10 minutes (backend/meetings.py) and are changed in Google.

const HOUR_PX = 48;
const FIRST_HOUR = 8; // the week view opens scrolled here

// Friendly names and colours per calendar; unknown calendars get the fallback.
const CALENDARS = {
  "content@finace.co": { label: "Content", dot: "#2b6de8", bg: "#e7efff", text: "#123a8c" },
  "projects@finace.co": { label: "Projects", dot: "#0f9d6b", bg: "#e2f5ec", text: "#0b5a3e" },
  "product@finace.co": { label: "Product", dot: "#e08a00", bg: "#fdf0d9", text: "#7a4a00" },
  "animate@finace.co": { label: "Animation", dot: "#8b4fd8", bg: "#f1e8fd", text: "#4f2588" },
};
const FALLBACK = { dot: "#64748b", bg: "#eef1f6", text: "#334155" };
const calStyle = (c) => CALENDARS[c] || { ...FALLBACK, label: c.split("@")[0] };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---- dates (local time; weeks start on Monday) ----------------------------
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (d, opts) => d.toLocaleDateString("en-GB", opts);
const timeLabel = (d) =>
  d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", "").toLowerCase();
const hourLabel = (h) => (h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`);

// All-day events carry plain dates ("2026-11-08", end exclusive).
const parseWhen = (value, allDay) => {
  if (allDay) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
};

function rangeFor(view, anchor) {
  if (view === "day") return [startOfDay(anchor), addDays(startOfDay(anchor), 1)];
  if (view === "week") {
    const s = startOfWeek(anchor);
    return [s, addDays(s, 7)];
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const s = startOfWeek(first);
  return [s, addDays(s, 42)];
}

function rangeTitle(view, anchor) {
  if (view === "day") return fmt(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "month") return fmt(anchor, { month: "long", year: "numeric" });
  const s = startOfWeek(anchor);
  const e = addDays(s, 6);
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()} – ${fmt(e, { day: "numeric", month: "long", year: "numeric" })}`
    : `${fmt(s, { day: "numeric", month: "short" })} – ${fmt(e, { day: "numeric", month: "short", year: "numeric" })}`;
}

// The same meeting on two of these calendars is one block with both dots.
function mergeEvents(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const key = `${r.ical_uid}|${r.start}`;
    const seen = map.get(key);
    if (seen) seen.calendars.push(r.calendar);
    else
      map.set(key, {
        ...r,
        calendars: [r.calendar],
        startDate: parseWhen(r.start, r.all_day),
        endDate: parseWhen(r.end, r.all_day),
      });
  });
  return [...map.values()];
}

// Side-by-side columns for overlapping timed events in one day (Google style).
function layoutDay(events) {
  const sorted = [...events].sort((a, b) => a.startDate - b.startDate || b.endDate - a.endDate);
  const out = [];
  let cluster = [];
  let clusterEnd = 0;
  const flush = () => {
    const cols = [];
    cluster.forEach((ev) => {
      let col = cols.findIndex((end) => end <= ev.startDate);
      if (col === -1) {
        col = cols.length;
        cols.push(ev.endDate);
      } else cols[col] = ev.endDate;
      out.push({ ev, col });
    });
    out.slice(out.length - cluster.length).forEach((o) => (o.cols = cols.length));
    cluster = [];
  };
  sorted.forEach((ev) => {
    if (cluster.length && ev.startDate >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.endDate);
  });
  if (cluster.length) flush();
  return out;
}

const plainText = (html) => {
  if (!html) return "";
  const el = document.createElement("div");
  el.innerHTML = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
  return (el.textContent || "").trim();
};

const RESPONSE = { accepted: "Going", declined: "Declined", tentative: "Maybe", needsAction: "Not answered" };

function EventDetails({ ev }) {
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

// One event block; clicking opens its details.
function EventChip({ ev, className = "", style, compact = false }) {
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

function TimeGrid({ days, events, now }) {
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

function MonthGrid({ anchor, events, now, onPickDay }) {
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

const ago = (iso) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso)) / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`;
};

export default function MeetingsPage() {
  const { currentUser } = useUser();
  const isMobile = useIsMobile();
  const [view, setView] = useState(() => (isMobile ? "day" : "week"));
  const [anchor, setAnchor] = useState(() => new Date());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());
  const [syncing, setSyncing] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [from, to] = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  const load = useCallback(() => {
    setLoading(true);
    return Promise.all([getMeetings(ymd(from), ymd(to)), getMeetingsStatus()])
      .then(([events, s]) => {
        setRows(events || []);
        setStatus(s);
      })
      .catch(() => toast.error("Couldn't load meetings. Refresh to try again."))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const events = useMemo(
    () =>
      mergeEvents(rows.filter((r) => !hidden.has(r.calendar))).filter((e) => e.startDate < to && e.endDate > from),
    [rows, hidden, from, to]
  );

  const step = (dir) =>
    setAnchor((a) =>
      view === "day" ? addDays(a, dir) : view === "week" ? addDays(a, 7 * dir) : new Date(a.getFullYear(), a.getMonth() + dir, 1)
    );

  const days = view === "day" ? [startOfDay(anchor)] : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));

  const calendars = status?.calendars || Object.keys(CALENDARS).map((calendar) => ({ calendar }));
  const lastSync = calendars.map((c) => c.last_synced_at).filter(Boolean).sort()[0];
  const failing = calendars.filter((c) => c.last_error);

  const upcoming = useMemo(
    () =>
      mergeEvents(rows.filter((r) => !hidden.has(r.calendar)))
        .filter((e) => !e.all_day && e.endDate > now && e.startDate < addDays(startOfDay(now), 1))
        .sort((a, b) => a.startDate - b.startDate)
        .slice(0, 5),
    [rows, hidden, now]
  );

  const syncNow = () => {
    setSyncing(true);
    syncMeetingsNow()
      .then(() => load())
      .then(() => toast("Calendars synced"))
      .catch((err) => toast.error(err?.response?.data?.detail || "Sync failed"))
      .finally(() => setSyncing(false));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#eaeef4] px-3 py-3 md:px-5">
        <h1 className="mr-2 text-xl font-semibold tracking-tight text-[#0d1b3e] md:text-2xl">Meetings</h1>
        <button
          type="button"
          onClick={() => setAnchor(new Date())}
          className="h-8 rounded-md border border-[#e2e6f0] px-3 text-[13px] font-medium text-[#0d1b3e] hover:bg-[#f5f6fb]"
        >
          Today
        </button>
        <div className="flex items-center">
          <button type="button" aria-label="Previous" onClick={() => step(-1)} className="grid h-8 w-8 place-items-center rounded-full text-[#546490] hover:bg-[#f0f2f8]">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Next" onClick={() => step(1)} className="grid h-8 w-8 place-items-center rounded-full text-[#546490] hover:bg-[#f0f2f8]">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <h2 className="min-w-0 flex-1 truncate text-[16px] font-medium text-[#0d1b3e] md:text-[18px]">{rangeTitle(view, anchor)}</h2>
        <span className="hidden text-[12px] text-[#94a0bf] md:inline">
          {loading ? "Loading…" : `Synced ${ago(lastSync)}`}
        </span>
        {currentUser?.role === "admin" && status?.configured && (
          <button
            type="button"
            onClick={syncNow}
            disabled={syncing}
            title="Fetch from Google now"
            className="grid h-8 w-8 place-items-center rounded-md border border-[#e2e6f0] text-[#546490] hover:bg-[#f5f6fb] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          </button>
        )}
        <div role="tablist" aria-label="View" className="inline-flex h-8 rounded-md border border-[#e2e6f0] p-0.5">
          {[
            ["day", "Day"],
            ["week", "Week"],
            ["month", "Month"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={`rounded px-3 text-[13px] ${view === key ? "bg-[#f0f0fd] font-semibold text-[#1a1a8a]" : "text-[#546490] hover:text-[#0d1b3e]"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {status && !status.configured && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-[13px] text-amber-800">
          Google Calendar isn't connected yet. A Google Workspace admin needs to finish the one-time setup in{" "}
          <code className="rounded bg-amber-100 px-1">docs/google-calendar-setup.md</code>.
        </div>
      )}
      {status?.configured && failing.length > 0 && (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-[13px] text-rose-800">
          Couldn't read {failing.map((c) => calStyle(c.calendar).label).join(", ")} from Google. Showing the last copy.{" "}
          <span className="text-rose-600">({failing[0].last_error.slice(0, 140)})</span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
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

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view === "month" ? (
            <MonthGrid
              anchor={anchor}
              events={events}
              now={now}
              onPickDay={(d) => {
                setAnchor(d);
                setView("day");
              }}
            />
          ) : (
            <TimeGrid days={days} events={events} now={now} />
          )}
        </main>
      </div>
    </div>
  );
}
