import { Check } from "lucide-react";
import { C } from "./sheetTheme";
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

// One status chip for every sheet (see ../StatusBadge).
export { StatusBadge } from "../StatusBadge";

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

