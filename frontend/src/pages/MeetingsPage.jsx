import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useUser } from "@/context/UserContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getMeetings, getMeetingsStatus, syncMeetingsNow } from "@/services/api";
import { MonthGrid } from "@/components/meetings/MonthGrid";
import { TimeGrid } from "@/components/meetings/TimeGrid";
import { MeetingsSidebar } from "@/components/meetings/MeetingsSidebar";
import { MeetingsToolbar } from "@/components/meetings/MeetingsToolbar";
import { CALENDARS, addDays, calStyle, mergeEvents, rangeFor, startOfDay, startOfWeek, ymd } from "@/components/meetings/meetingsLogic";


// Meetings: the company calendars (content@, projects@, product@, animate@, info@) in a Google
// Calendar style Day / Week / Month view. Read-only: the events come from
// Google every ~10 minutes (backend/meetings.py) and are changed in Google.

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

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true);
    return Promise.all([getMeetings(ymd(from), ymd(to)), getMeetingsStatus()])
      .then(([events, s]) => {
        setRows(events || []);
        setStatus(s);
      })
      .catch(() => {
        if (!quiet) toast.error("Couldn't load meetings. Refresh to try again.");
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  // Pick up new meetings without a manual refresh: quietly re-read every 2 minutes
  // and when the tab comes back into view (the server hears about changes from
  // Google within seconds, so this is all that is needed here).
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") load(true);
    };
    const t = setInterval(again, 120_000);
    document.addEventListener("visibilitychange", again);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", again);
    };
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


  const ctx = {
    anchor,
    calendars,
    currentUser,
    hidden,
    lastSync,
    loading,
    now,
    setAnchor,
    setHidden,
    setView,
    status,
    step,
    syncNow,
    syncing,
    upcoming,
    view,
  };
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <MeetingsToolbar {...ctx} />

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
        <MeetingsSidebar {...ctx} />

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
