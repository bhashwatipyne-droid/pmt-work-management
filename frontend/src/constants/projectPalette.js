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
  Finish: {
    dot: "bg-emerald-500",
    text: "text-emerald-600",
  },
};

export const STATUS_COLORS = {
  Active: {
    dot: "bg-blue-500",
    header: "bg-blue-50 border-blue-200",
    text: "text-blue-700",
    badge: "bg-blue-100 text-blue-700",
    ring: "ring-blue-300",
  },

  "Approval Pending": {
    dot: "bg-amber-500",
    header: "bg-amber-50 border-amber-200",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
    ring: "ring-amber-300",
  },

  Completed: {
    dot: "bg-emerald-500",
    header: "bg-emerald-50 border-emerald-200",
    text: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700",
    ring: "ring-emerald-300",
  },

  "Raised Invoice": {
    dot: "bg-violet-500",
    header: "bg-violet-50 border-violet-200",
    text: "text-violet-700",
    badge: "bg-violet-100 text-violet-700",
    ring: "ring-violet-300",
  },

  "On Hold": {
    dot: "bg-orange-500",
    header: "bg-orange-50 border-orange-200",
    text: "text-orange-700",
    badge: "bg-orange-100 text-orange-700",
    ring: "ring-orange-300",
  },

  Scrapped: {
    dot: "bg-slate-500",
    header: "bg-slate-50 border-slate-200",
    text: "text-slate-700",
    badge: "bg-slate-100 text-slate-700",
    ring: "ring-slate-300",
  },
};

export const PROJECT_STATUSES = [
  "Active",
  "Approval Pending",
  "Completed",
  "Raised Invoice",
  "On Hold",
  "Scrapped",
];

export const STAGES = ["Content", "Design", "Animate", "Finish"];