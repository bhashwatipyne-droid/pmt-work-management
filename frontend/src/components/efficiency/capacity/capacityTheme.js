// Colours, inline styles and small helpers of the Monthly Capacity page.

export const C = {
  brand50: "rgb(240,240,253)",
  brand100: "rgb(220,220,248)",
  brand400: "rgb(61,61,204)",
  brand500: "rgb(43,43,181)",
  brand700: "rgb(26,26,138)",
  n50: "rgb(249,250,251)",
  n100: "rgb(245,246,248)",
  n200: "rgb(239,240,242)",
  n400: "rgb(138,151,181)",
  n500: "rgb(84,100,144)",
  n700: "rgb(74,88,120)",
  n900: "rgb(13,27,62)",
  line: "rgb(234,238,244)",
  lineSoft: "rgb(243,244,246)",
  success100: "rgb(209,250,229)",
  success500: "rgb(16,185,129)",
  successFg: "rgb(0,91,75)",
  warning100: "rgb(254,243,199)",
  warning500: "rgb(245,158,11)",
  warningFg: "rgb(146,64,14)",
  error500: "rgb(239,68,68)",
};

export const SEG_SHADOW = "0 1px 2px 0 rgba(13,28,61,0.05)";
export const DEFAULTS = { wd: 22, lv: 0, hpd: 8.5 };

export const fmtN = (v, d = 0) => {
  const n = Number(v) || 0;
  return n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
};

export const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "?";

export const cardStyle = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: `inset 0 0 0 1px ${C.line}`,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

export const stepBtnStyle = {
  width: 36,
  height: 36,
  flexShrink: 0,
  border: "none",
  borderRadius: 7,
  background: C.n50,
  boxShadow: `inset 0 0 0 1px ${C.n200}`,
  color: C.n700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

export const focusRing = (e, on) => {
  e.currentTarget.style.boxShadow = on
    ? `inset 0 0 0 1px ${C.brand500},0 0 0 3px ${C.brand100}`
    : `inset 0 0 0 1px ${C.n200}`;
};

export const hoverBg = (bg, fg) => ({
  onMouseEnter: (e) => {
    e.currentTarget.dataset.bg = e.currentTarget.style.background;
    e.currentTarget.dataset.fg = e.currentTarget.style.color;
    e.currentTarget.style.background = bg;
    if (fg) e.currentTarget.style.color = fg;
  },
  onMouseLeave: (e) => {
    e.currentTarget.style.background = e.currentTarget.dataset.bg;
    if (fg) e.currentTarget.style.color = e.currentTarget.dataset.fg;
  },
});

export const toForm = (cap) =>
  cap
    ? {
        wd: String(cap.working_days),
        lv: String(cap.leave_days),
        hpd: String(cap.working_hours_per_day),
      }
    : { wd: "", lv: "", hpd: "" };
