export const HOUR_PX = 48;
export const FIRST_HOUR = 8; // the week view opens scrolled here

// Friendly names and colours per calendar; unknown calendars get the fallback.
export const CALENDARS = {
  "content@finace.co": { label: "Content", dot: "#2b6de8", bg: "#e7efff", text: "#123a8c" },
  "projects@finace.co": { label: "Projects", dot: "#0f9d6b", bg: "#e2f5ec", text: "#0b5a3e" },
  "product@finace.co": { label: "Product", dot: "#e08a00", bg: "#fdf0d9", text: "#7a4a00" },
  "animate@finace.co": { label: "Animation", dot: "#8b4fd8", bg: "#f1e8fd", text: "#4f2588" },
  "info@finace.co": { label: "Info", dot: "#d6336c", bg: "#fde7ef", text: "#8a1f47" },
};
export const FALLBACK = { dot: "#64748b", bg: "#eef1f6", text: "#334155" };
export const calStyle = (c) => CALENDARS[c] || { ...FALLBACK, label: c.split("@")[0] };

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---- dates (local time; weeks start on Monday) ----------------------------
export const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const sameDay = (a, b) => a.toDateString() === b.toDateString();
export const startOfWeek = (d) => addDays(startOfDay(d), -((d.getDay() + 6) % 7));
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fmt = (d, opts) => d.toLocaleDateString("en-GB", opts);
export const timeLabel = (d) =>
  d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", "").toLowerCase();
export const hourLabel = (h) => (h === 0 ? "12 am" : h < 12 ? `${h} am` : h === 12 ? "12 pm" : `${h - 12} pm`);

// All-day events carry plain dates ("2026-11-08", end exclusive).
export const parseWhen = (value, allDay) => {
  if (allDay) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(value);
};

export function rangeFor(view, anchor) {
  if (view === "day") return [startOfDay(anchor), addDays(startOfDay(anchor), 1)];
  if (view === "week") {
    const s = startOfWeek(anchor);
    return [s, addDays(s, 7)];
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const s = startOfWeek(first);
  return [s, addDays(s, 42)];
}

export function rangeTitle(view, anchor) {
  if (view === "day") return fmt(anchor, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "month") return fmt(anchor, { month: "long", year: "numeric" });
  const s = startOfWeek(anchor);
  const e = addDays(s, 6);
  return s.getMonth() === e.getMonth()
    ? `${s.getDate()} – ${fmt(e, { day: "numeric", month: "long", year: "numeric" })}`
    : `${fmt(s, { day: "numeric", month: "short" })} – ${fmt(e, { day: "numeric", month: "short", year: "numeric" })}`;
}

// The same meeting on two of these calendars is one block with both dots.
export function mergeEvents(rows) {
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
export function layoutDay(events) {
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

export const plainText = (html) => {
  if (!html) return "";
  const el = document.createElement("div");
  el.innerHTML = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n");
  return (el.textContent || "").trim();
};

export const RESPONSE = { accepted: "Going", declined: "Declined", tentative: "Maybe", needsAction: "Not answered" };

export const ago = (iso) => {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso)) / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`;
};
