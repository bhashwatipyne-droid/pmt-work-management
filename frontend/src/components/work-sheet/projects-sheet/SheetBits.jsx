import { Check } from "lucide-react";
import { BADGE, C, STATUS_BADGE, MANROPE } from "./sheetTheme";
import { initials } from "./sheetDates";

export function Checkbox({ on, partial, onClick, label }) {
  return (
    <span
      role="checkbox"
      aria-checked={partial ? "mixed" : on}
      aria-label={label}
      onClick={onClick}
      style={{
        width: 16,
        height: 16,
        borderRadius: 5.333,
        background: on || partial ? C.b500 : "#fff",
        boxShadow: on || partial ? "none" : `inset 0 0 0 1px ${C.n300}`,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 120ms ease, box-shadow 120ms ease",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {on && <Check className="h-3 w-3" strokeWidth={3} />}
      {partial && !on && <span style={{ width: 8, height: 2, borderRadius: 1, background: "#fff" }} />}
    </span>
  );
}

export function StatusBadge({ status }) {
  const s = BADGE[STATUS_BADGE[status] || "Neutral"];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 24,
        padding: "4px 12px",
        boxSizing: "border-box",
        borderRadius: 9999,
        background: s.bg,
        boxShadow: `inset 0 0 0 1px ${s.ring}`,
        color: s.fg,
        font: `400 10px/16px ${MANROPE}`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 9999, background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

export function Avatar({ name, size = 20, fontSize = 9 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        background: C.b50,
        color: C.b700,
        fontSize,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </span>
  );
}

