// Palette for project stages and statuses

export const STAGE_COLORS = {
  Content: {
    dot: "bg-indigo-500",
    text: "text-indigo-600",
  },
  Design: {
    dot: "bg-purple-500",
    text: "text-purple-600",
  },
  Animate: {
    dot: "bg-amber-500",
    text: "text-amber-600",
  },
};

export const STATUS_COLORS = {
  Active: {
    dot: "bg-blue-500",
    header: "bg-blue-50 border-blue-200",
    text: "text-blue-700",
    badge: "bg-blue-100 text-blue-700",
    ring: "ring-blue-300",
    cardBorder: "border-l-blue-500",
  },

  "Approval Pending": {
    dot: "bg-amber-500",
    header: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
    ring: "ring-amber-300",
    cardBorder: "border-l-amber-500",
  },

  Completed: {
    dot: "bg-emerald-500",
    header: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700",
    ring: "ring-emerald-300",
    cardBorder: "border-l-emerald-500",
  },

  "Ready for Invoice": {
    dot: "bg-teal-500",
    header: "bg-teal-50 border-teal-200",
    text: "text-teal-700",
    badge: "bg-teal-100 text-teal-700",
    ring: "ring-teal-300",
    cardBorder: "border-l-teal-500",
  },

  "Raised Invoice": {
    dot: "bg-violet-500",
    header: "bg-violet-50 border-violet-200",
    text: "text-violet-700",
    badge: "bg-violet-100 text-violet-700",
    ring: "ring-violet-300",
    cardBorder: "border-l-violet-500",
  },

  "On Hold": {
    dot: "bg-orange-500",
    header: "bg-orange-50 border-orange-200",
    text: "text-orange-700",
    badge: "bg-orange-100 text-orange-700",
    ring: "ring-orange-300",
    cardBorder: "border-l-orange-500",
  },

  Scrapped: {
    dot: "bg-slate-500",
    header: "bg-slate-50 border-slate-200",
    text: "text-slate-700",
    badge: "bg-slate-100 text-slate-700",
    ring: "ring-slate-300",
    cardBorder: "border-l-slate-500",
  },
};

export const PROJECT_STATUSES = [
  "Active",
  "Approval Pending",
  "Completed",
  "Ready for Invoice",
  "Raised Invoice",
  "On Hold",
  "Scrapped",
];

export const STAGES = ["Content", "Design", "Animate"];

// ---- Projects board / list (Figma "Campaigns" frames) -------------------
// Exact hex values from the design. `dot` is the column dot, card edge and
// list status dot; `head*` tint the column header; `badge*` style the
// status pill on cards and list rows. Statuses the design doesn't show
// (invoice / hold / scrapped) get colours from the same family.
export const PROJECT_STATUS_STYLE = {
  Active: {
    dot: "#3b6ef6", headBg: "#f4f7ff", headBorder: "#dce6fe",
    badgeBg: "#eff4ff", badgeBorder: "#cfddfc", badgeText: "#1d4ed8",
  },
  "Approval Pending": {
    dot: "#e08a0b", headBg: "#fffbf2", headBorder: "#fbe6be",
    badgeBg: "#fffaeb", badgeBorder: "#fce3a9", badgeText: "#b45309",
  },
  Completed: {
    dot: "#0fa36b", headBg: "#f2fcf7", headBorder: "#cdeedd",
    badgeBg: "#ecfdf3", badgeBorder: "#c9eedc", badgeText: "#047857",
  },
  "Ready for Invoice": {
    dot: "#0d9488", headBg: "#f0fdfa", headBorder: "#c4ebe5",
    badgeBg: "#effcf9", badgeBorder: "#bfe9e2", badgeText: "#0f766e",
  },
  "Raised Invoice": {
    dot: "#7c5cf6", headBg: "#f7f5ff", headBorder: "#e2dbfe",
    badgeBg: "#f5f1fe", badgeBorder: "#ddd2fa", badgeText: "#5b21b6",
  },
  "On Hold": {
    dot: "#e2566c", headBg: "#fff5f6", headBorder: "#fbd5db",
    badgeBg: "#fff1f3", badgeBorder: "#fbcfd6", badgeText: "#be123c",
  },
  Scrapped: {
    dot: "#8a93a2", headBg: "#f7f8fa", headBorder: "#e3e6ec",
    badgeBg: "#f3f4f6", badgeBorder: "#e3e6ec", badgeText: "#4b5563",
  },
};

export const STAGE_HEX = {
  Content: "#3b6ef6",
  Design: "#7c5cf6",
  Animate: "#e08a0b",
};

// Small coloured dot before a client's name: a stable colour per client.
const CLIENT_DOTS = ["#e06a4b", "#2f7d8c", "#8a93a2", "#7c5cf6", "#0fa36b", "#e08a0b", "#3b6ef6"];
export const clientDotColor = (name = "") => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CLIENT_DOTS[hash % CLIENT_DOTS.length];
};
