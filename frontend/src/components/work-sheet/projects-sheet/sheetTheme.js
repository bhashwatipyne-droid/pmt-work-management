// Redesign (Mint) tokens and popover chrome for the Management sheet.
export const C = {
  n50: "#f9fafb",
  n100: "#f5f6f8",
  n200: "#eff0f2",
  n300: "#d1d5db",
  n400: "#8a97b5",
  n500: "#546490",
  n700: "#4a5878",
  n900: "#0d1b3e",
  b50: "#f0f0fd",
  b100: "#dcdcf8",
  b200: "#9090ec",
  b500: "#2b2bb5",
  b700: "#1a1a8a",
  line: "#e2e8f0", // header / gutter grid lines
  cellLine: "#eaeef4", // body grid lines
  edge: "#d6deec", // right edge of the frozen columns
};

export const BADGE = {
  Success: { bg: "#d1fae5", ring: "#d1fae5", fg: "rgb(0,91,75)", dot: "#10b981" },
  Warning: { bg: "#fef3c7", ring: "#fef3c7", fg: "rgb(146,64,14)", dot: "#f59e0b" },
  Error: { bg: "#fff5f5", ring: "#fff5f5", fg: "#ef4444", dot: "#ef4444" },
  Neutral: { bg: C.n100, ring: C.n200, fg: C.n700, dot: C.n400 },
  // Done gets its own colour so a finished task doesn't look like an
  // on-track one (both were green).
  Done: { bg: "#eef2ff", ring: "#e0e7ff", fg: "#4338ca", dot: "#6366f1" },
};
export const STATUS_BADGE = { "On track": "Success", Done: "Done", "At risk": "Warning", Delayed: "Error" };
export const MANROPE = "Manrope, Inter, -apple-system, sans-serif";

// Popover chrome from the redesign's menus.
export const MENU =
  "flex max-h-[460px] w-[300px] flex-col overflow-hidden rounded-[12px] border-0 p-0 text-[13px] text-[#0d1b3e] shadow-[0_0_0_1px_#eaeef4,0_6px_25px_rgba(13,28,61,0.12)]";
export const MENU_LABEL = "px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase leading-[14px] tracking-[0.05em] text-[#546490]";
export const MENU_ITEM =
  "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2 text-left text-[13px] text-[#0d1b3e] hover:bg-[#f0f0fd]";
