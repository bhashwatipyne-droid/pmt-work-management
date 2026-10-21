// Colours, class strings and formatting used by the Home dashboard.

export const C = {
  n900: "rgb(13,27,62)",
  n700: "rgb(74,88,120)",
  n500: "rgb(84,100,144)",
  n400: "rgb(138,151,181)",
  n100: "rgb(245,246,248)",
  n50: "rgb(249,250,251)",
  brand500: "rgb(43,43,181)",
  brand700: "rgb(26,26,138)",
  brand100: "rgb(220,220,248)",
  brand50: "rgb(240,240,253)",
  success500: "rgb(16,185,129)",
  success100: "rgb(209,250,229)",
  successText: "rgb(0,91,75)",
  warning500: "rgb(245,158,11)",
  warning100: "rgb(254,243,199)",
  warningText: "rgb(146,64,14)",
  error500: "rgb(239,68,68)",
  error50: "rgb(255,245,245)",
  info500: "rgb(59,130,246)",
  info100: "rgb(219,234,254)",
  infoText: "rgb(30,64,175)",
};

export const STAGE_DOT = { Content: C.brand500, Design: C.info500, Animate: C.warning500 };

export const BADGE = {
  Neutral: { bg: C.n100, ring: "rgb(239,240,242)", fg: C.n700, dot: C.n400 },
  Info: { bg: C.info100, ring: C.info100, fg: C.infoText, dot: C.info500 },
  Warning: { bg: C.warning100, ring: C.warning100, fg: C.warningText, dot: C.warning500 },
  Success: { bg: C.success100, ring: C.success100, fg: C.successText, dot: C.success500 },
  Error: { bg: C.error50, ring: C.error50, fg: C.error500, dot: C.error500 },
};
export const PRI_BADGE = { Critical: "Error", High: "Warning", Medium: "Info", Watch: "Neutral" };
export const NEXT_BADGE = { "On track": "Success", "At risk": "Warning", Delayed: "Error", "In review": "Info" };
export const LEVEL_BADGE = { High: "Error", Watch: "Warning", Healthy: "Success" };

export const HAIRLINE = "shadow-[inset_0_0_0_1px_rgb(234,238,244)]";
export const CARD = `rounded-xl bg-white ${HAIRLINE}`;
export const EYEBROW =
  "font-['Manrope','Inter',sans-serif] text-[11px] font-bold uppercase leading-4 tracking-[0.06em] text-[rgb(84,100,144)]";
export const HEAD_ROW =
  "h-9 items-center bg-[rgb(249,250,251)] px-4 text-[12px] font-semibold text-[rgb(74,88,120)] shadow-[inset_0_1px_0_rgb(234,238,244),inset_0_-1px_0_rgb(226,232,240)]";
export const ROW_DIVIDER = "shadow-[inset_0_-1px_0_rgb(243,244,246)]";
export const LINK_BTN =
  "flex h-7 items-center gap-1 whitespace-nowrap rounded-[7px] px-2 text-[13px] font-semibold text-[rgb(43,43,181)] hover:bg-[rgb(240,240,253)]";
export const BTN_PRIMARY =
  "inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[rgb(43,43,181)] px-3.5 text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-[rgb(61,61,204)]";
export const BTN_SECONDARY =
  "inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[rgb(245,246,248)] px-3.5 text-[12px] font-semibold leading-4 text-[rgb(74,88,120)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] transition-colors hover:bg-[rgb(243,244,246)]";

export const ACTION_GRID =
  "grid grid-cols-[96px_minmax(280px,2.2fr)_minmax(180px,1fr)_104px_64px_64px] gap-x-4";
export const PORT_GRID =
  "grid grid-cols-[minmax(240px,2fr)_64px_64px_64px_64px_72px_104px] gap-x-3";

export const hrs = (n) => `${Math.round(n || 0).toLocaleString("en-IN")}h`;
