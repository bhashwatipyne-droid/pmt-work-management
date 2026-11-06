// Small pieces shared by the Projects board and list, styled to the Figma
// "Campaigns" frames (exact px sizes and hex colours from the design).
import { Check } from "lucide-react";

import { PROJECT_STATUS_STYLE } from "@/constants/projectPalette";

export const statusStyle = (status) =>
  PROJECT_STATUS_STYLE[status] || PROJECT_STATUS_STYLE.Scrapped;

// Blend two #rrggbb colours: `pct` percent of `hex`, the rest `base`.
// (Same result as CSS color-mix(in srgb, hex pct%, base), done in JS so it
// works in every browser.)
const mixHex = (hex, pct, base = "#ffffff") => {
  const parse = (h) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h || "");
    const n = m ? parseInt(m[1], 16) : 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = parse(hex);
  const b = parse(base);
  const out = a.map((v, i) => Math.round((v * pct + b[i] * (100 - pct)) / 100));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

// Board column colours from the redesign: a faint status tint behind the
// whole column, a stronger one on the header, a border, and dark "ink" text.
export const columnTint = (status) => {
  const dot = statusStyle(status).dot;
  return {
    dot,
    tint: mixHex(dot, 7),
    head: mixHex(dot, 16),
    edge: mixHex(dot, 30),
    ink: mixHex(dot, 55, "#0d1c3d"),
  };
};

// Client tile on cards: two initials on a soft colour that stays the same
// for a client everywhere.
const CLIENT_TILES = [
  ["#E0EAFF", "#1E3A8A"],
  ["#DCF5EC", "#065F46"],
  ["#FDEBD3", "#92400E"],
  ["#F5E1F7", "#86198F"],
  ["#E1F1FB", "#075985"],
  ["#FDE2E4", "#9F1239"],
];
export const clientTile = (name = "") => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const [bg, fg] = CLIENT_TILES[hash % CLIENT_TILES.length];
  return { bg, fg };
};
export const clientInitials = (name = "") =>
  name
    .split(/\s+/)
    .filter((w) => /^[A-Za-z0-9]/.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("") || "—";

// "03 Sep"
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDayMonth = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return "No deadline";
  return `${m[3]} ${MONTHS[Number(m[2]) - 1]}`;
};

// A deadline only turns red while the project is still in production.
const OPEN_STATUSES = new Set(["Active", "Approval Pending", "On Hold"]);
export const isProjectOverdue = (project) => {
  const end = (project.end_date || "").slice(0, 10);
  if (!end || !OPEN_STATUSES.has(project.status)) return false;
  return end < new Date().toISOString().slice(0, 10);
};

export const ProjectStatusBadge = ({ status }) => {
  const s = statusStyle(status);
  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-[5px] border px-2 text-[11px] font-medium leading-none"
      style={{ background: s.badgeBg, borderColor: s.badgeBorder, color: s.badgeText }}
    >
      {status === "Completed" && <Check className="h-3 w-3" strokeWidth={2.5} />}
      {status}
    </span>
  );
};

// The three-dot "more" glyph from the design (three 2px dots, 4px apart).
export const MoreDots = () => (
  <span className="flex items-center gap-[2px]" aria-hidden="true">
    <span className="h-[2px] w-[2px] rounded-full bg-[#a9b0bd]" />
    <span className="h-[2px] w-[2px] rounded-full bg-[#a9b0bd]" />
    <span className="h-[2px] w-[2px] rounded-full bg-[#a9b0bd]" />
  </span>
);

// Stat tile from the design: 69px tall, 11.5px label, 19px value. (The
// dashboard keeps its own ProjectMetricCard.)
export const ProjectStatTile = ({ label, value, testId }) => (
  <div
    data-testid={testId}
    className="h-[69px] rounded-[10px] border border-[#e7e9ee] bg-white px-[15px] pt-[12.5px]"
  >
    <div className="text-[11.5px] leading-[14px] text-[#6b7280]">{label}</div>
    <div className="mt-[3.5px] text-[19px] font-bold leading-[23px] text-[#11151c]">
      {value}
    </div>
  </div>
);
