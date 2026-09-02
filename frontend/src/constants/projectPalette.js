// Palette for the 4 project stages and 4 project statuses (matches PMT reference)
export const STAGE_COLORS = {
  Content: { dot: "bg-indigo-500", text: "text-indigo-600" },
  Design: { dot: "bg-purple-500", text: "text-purple-600" },
  Animate: { dot: "bg-amber-500", text: "text-amber-600" },
  Finish: { dot: "bg-emerald-500", text: "text-emerald-600" },
};

export const STATUS_COLORS = {
  Planning: {
    dot: "bg-purple-500",
    header: "bg-purple-50 border-purple-200",
    text: "text-purple-700",
    badge: "bg-purple-100 text-purple-700",
    ring: "ring-purple-300",
  },
  Active: {
    dot: "bg-blue-500",
    header: "bg-blue-50 border-blue-200",
    text: "text-blue-700",
    badge: "bg-blue-100 text-blue-700",
    ring: "ring-blue-300",
  },
  "In Rework": {
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
};

export const PROJECT_STATUSES = ["Planning", "Active", "In Rework", "Completed"];
export const STAGES = ["Content", "Design", "Animate", "Finish"];
