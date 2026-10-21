import { STAGES } from "@/constants/projectPalette";

// Colours, class strings, date/time formatting and the status rules used by
// the project page - plain values and functions, no React.

// Colours from the redesign's Mint design system tokens.
export const BRAND_500 = "rgb(43,43,181)";
export const INFO_500 = "rgb(59,130,246)";
export const WARNING_500 = "rgb(245,158,11)";
export const SUCCESS_500 = "rgb(16,185,129)";
export const NEUTRAL_400 = "rgb(138,151,181)";
export const NEUTRAL_900 = "rgb(13,27,62)";

export const STAGE_DOT = {
  Content: BRAND_500,
  Design: INFO_500,
  Animate: WARNING_500,
};

export const PROJECT_STATUS_DOT = {
  Active: BRAND_500,
  "Approval Pending": WARNING_500,
  Completed: SUCCESS_500,
  "Ready for Invoice": SUCCESS_500,
  "Raised Invoice": INFO_500,
  "On Hold": WARNING_500,
  Scrapped: NEUTRAL_400,
};

// Mint "Badge" (type Dot, size sm) colour sets.
export const BADGE = {
  Neutral: { bg: "rgb(245,246,248)", ring: "rgb(239,240,242)", fg: "rgb(74,88,120)", dot: NEUTRAL_400 },
  Brand: { bg: "rgb(240,240,253)", ring: "rgb(240,240,253)", fg: "rgb(26,26,138)", dot: BRAND_500 },
  Info: { bg: "rgb(219,234,254)", ring: "rgb(219,234,254)", fg: "rgb(30,64,175)", dot: INFO_500 },
  Warning: { bg: "rgb(254,243,199)", ring: "rgb(254,243,199)", fg: "rgb(146,64,14)", dot: WARNING_500 },
  Success: { bg: "rgb(209,250,229)", ring: "rgb(209,250,229)", fg: "rgb(0,91,75)", dot: SUCCESS_500 },
  Error: { bg: "rgb(255,245,245)", ring: "rgb(255,245,245)", fg: "rgb(239,68,68)", dot: "rgb(239,68,68)" },
};

// A deliverable's stage_status is derived by the backend from the work sheet,
// so it is shown read-only here, in the redesign's wording.
export const DELIVERABLE_STATUSES = [
  { key: "Not Started", label: "Not started", badge: "Neutral" },
  { key: "In Progress", label: "In progress", badge: "Brand" },
  { key: "Ready for Review", label: "In review", badge: "Info" },
  { key: "Changes Requested", label: "Changes requested", badge: "Warning" },
  { key: "Completed", label: "Done", badge: "Success" },
];
export const DELIVERABLE_STATUS = Object.fromEntries(
  DELIVERABLE_STATUSES.map((s) => [s.key, s])
);

export const WORK_STATUS_BADGE = {
  "Not Started": "Neutral",
  Ongoing: "Brand",
  "On Hold": "Warning",
  "Ready for Review": "Info",
  "Changes Requested": "Warning",
  Rework: "Error",
  Closed: "Success",
  Scrap: "Error",
};

export const DELIV_GRID =
  "grid grid-cols-[minmax(260px,2.2fr)_210px_170px_minmax(130px,1fr)] gap-x-4 max-md:grid-cols-[minmax(0,1fr)_auto] max-md:gap-y-1";
export const LOG_GRID =
  "grid grid-cols-[190px_minmax(220px,2fr)_110px_70px_120px] gap-x-4";

export const HAIRLINE = "shadow-[inset_0_0_0_1px_rgb(234,238,244)]";
export const HEAD_ROW =
  "h-[38px] items-center bg-[rgb(249,250,251)] px-4 text-xs font-semibold text-[rgb(74,88,120)] shadow-[inset_0_1px_0_rgb(234,238,244),inset_0_-1px_0_rgb(226,232,240)]";
export const MENU =
  "w-[200px] rounded-xl border-0 bg-white p-1.5 shadow-[0_0_0_1px_rgb(234,238,244),0_6px_25px_rgba(13,28,61,0.12)]";
export const MENU_ITEM =
  "flex h-8 cursor-pointer items-center gap-2 rounded-[7px] px-2 text-[13px] text-[rgb(13,27,62)] focus:bg-[rgb(240,240,253)] focus:text-[rgb(13,27,62)]";
export const ICON_BTN =
  "flex h-[34px] w-[34px] items-center justify-center rounded-[7px] bg-white text-[rgb(74,88,120)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] hover:bg-[rgb(249,250,251)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgb(220,220,248)]";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "2026-09-02" / ISO timestamps -> { d: "02", m: "Sep", y: 2026 }, read as a
// calendar date so no timezone can shift it by a day.
export const parts = (iso) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!match) return null;
  const [, y, m, d] = match;
  return { y: Number(y), m: MONTHS[Number(m) - 1], mi: Number(m), d };
};

// "01 Sep → 10 Oct 2026"
export const fmtRange = (start, end) => {
  const s = parts(start);
  const e = parts(end);
  if (!s && !e) return "No dates";
  if (!e) return `From ${s.d} ${s.m} ${s.y}`;
  if (!s) return `Due ${e.d} ${e.m} ${e.y}`;
  const from = s.y === e.y ? `${s.d} ${s.m}` : `${s.d} ${s.m} ${s.y}`;
  return `${from} → ${e.d} ${e.m} ${e.y}`;
};

// "02–04 Sep", "28 Sep – 03 Oct", "due 04 Sep"
export const fmtWindow = (start, end) => {
  const s = parts(start);
  const e = parts(end);
  if (!s && !e) return "Not scheduled";
  if (!s) return `due ${e.d} ${e.m}`;
  if (!e) return `from ${s.d} ${s.m}`;
  if (s.y === e.y && s.mi === e.mi) {
    return s.d === e.d ? `${s.d} ${s.m}` : `${s.d}–${e.d} ${e.m}`;
  }
  return `${s.d} ${s.m} – ${e.d} ${e.m}`;
};

// "Mon, 28 Sep"
export const fmtDay = (iso) => {
  const p = parts(iso);
  if (!p) return "No date";
  const weekday = WEEKDAYS[new Date(p.y, p.mi - 1, Number(p.d)).getDay()];
  return `${weekday}, ${p.d} ${p.m}`;
};

// 40h 35m / 2h / 30m
export const fmtMin = (minutes) => {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return (h ? `${h}h` : "") + (h && r ? " " : "") + (r || !h ? `${r}m` : "");
};

export const initials = (name) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export const todayIso = () => new Date().toISOString().slice(0, 10);

// Deliverables imported as already finished (import status "Finish") are stored
// by older imports as current_stage "Finish" + stage_status "Closed". Show them
// where newer imports put them: at the last of their own stages, as Completed.
export const stageOf = (d) => {
  if (STAGES.includes(d.current_stage)) return d.current_stage;
  const own = (d.required_stages || []).filter((s) => STAGES.includes(s));
  return own[own.length - 1] || "Content";
};
// Imported / work-sheet wording that is not in the deliverable status list:
// Closed = done, Ongoing = in progress, Rework = changes requested. Without this
// they all fell through to "Not started".
export const LEGACY_STATUS = { Closed: "Completed", Ongoing: "In Progress", Rework: "Changes Requested" };
export const statusOf = (d) => LEGACY_STATUS[d.stage_status] || d.stage_status || "Not Started";

export const stageWindow = (d) => {
  const w = d.stage_schedule?.[d.current_stage];
  if (w) return { start: w.start_dt, end: w.end_dt };
  return { start: d.start_dt, end: d.end_dt };
};

// Mirrors the backend's per-stage overdue check (server.py's
// _ensure_overdue_notifications) so the schedule reads "late" right away.
export const isOverdue = (d) => {
  if (statusOf(d) === "Completed") return false;
  const end = d.stage_schedule?.[d.current_stage]?.end_dt;
  return Boolean(end) && end.slice(0, 10) < todayIso();
};
