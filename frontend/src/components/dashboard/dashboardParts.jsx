import { BADGE, C, EYEBROW } from "./dashboardTheme";

// Small building blocks of the Home dashboard.

// ---------------------------------------------------------------------------
// Small pieces

export const Dot = ({ color, size = 8, className = "" }) => (
  <span
    className={`shrink-0 rounded-full ${className}`}
    style={{ width: size, height: size, background: color }}
  />
);

export const Badge = ({ color = "Neutral", children }) => {
  const c = BADGE[color] || BADGE.Neutral;
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 font-['Manrope','Inter',sans-serif] text-[10px] leading-4"
      style={{ background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1px ${c.ring}` }}
    >
      <Dot color={c.dot} size={6} />
      {children}
    </span>
  );
};

export const Pill = ({ bg, fg, children }) => (
  <span
    className="self-start whitespace-nowrap rounded-full px-[7px] py-px font-['Manrope','Inter',sans-serif] text-[11px] font-medium leading-4"
    style={{ background: bg, color: fg }}
  >
    {children}
  </span>
);

export const Block = ({ title, children }) => (
  <div className="flex min-w-0 flex-col gap-2.5">
    <span className={EYEBROW}>{title}</span>
    {children}
  </div>
);

export const SectionHead = ({ title, sub, children }) => (
  <div className="flex flex-wrap items-start gap-3 px-4 pb-3 pt-4">
    <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
      <h2 className="m-0 text-[15px] font-semibold leading-5 text-[rgb(13,27,62)]">{title}</h2>
      <span className="text-[12px] leading-4 text-[rgb(84,100,144)] [text-wrap:pretty]">{sub}</span>
    </div>
    {children}
  </div>
);

export const Avatar = ({ name }) => (
  <span className="h-6 w-6 shrink-0 rounded-full bg-[rgb(240,240,253)] text-center font-['Manrope','Inter',sans-serif] text-[10px] font-semibold leading-6 text-[rgb(26,26,138)]">
    {(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
  </span>
);

export const StatTile = ({ label, value, sub, color = C.n900, rounded = "rounded-lg", pad = "px-3 py-2.5", subSize = "text-[11px]" }) => (
  <div className={`flex flex-col gap-0.5 bg-[rgb(249,250,251)] ${rounded} ${pad}`}>
    <span className="text-[12px] text-[rgb(84,100,144)]">{label}</span>
    <span className="text-xl font-semibold leading-6 tabular-nums" style={{ color }}>
      {value}
    </span>
    {sub && <span className={`${subSize} text-[rgb(84,100,144)]`}>{sub}</span>}
  </div>
);

export const Empty = ({ children }) => (
  <div className="px-4 py-6 text-center text-[13px] text-[rgb(84,100,144)]">{children}</div>
);
