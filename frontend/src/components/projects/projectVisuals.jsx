// Small pieces shared by the Projects board and list, styled to the Figma
// "Campaigns" frames (exact px sizes and hex colours from the design).
import { Check } from "lucide-react";

import { PROJECT_STATUS_STYLE } from "@/constants/projectPalette";

export const statusStyle = (status) =>
  PROJECT_STATUS_STYLE[status] || PROJECT_STATUS_STYLE.Scrapped;

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
