import { useEffect, useState } from "react";
import { Info, RefreshCw, Table2, X } from "lucide-react";

const W = 360;
const SHADOW = "0 6px 25px rgba(13,28,61,0.12), inset 0 0 0 1px rgb(234,238,244)";

// Opens next to the clicked bar and stays inside the window.
export const popoverPosition = (rect, vw, vh) => {
  const room = vw - rect.right;
  const left = room >= W + 12 ? rect.right + 8 : Math.max(12, Math.min(rect.left, vw - W - 12));
  const top = Math.max(12, Math.min(rect.top, vh - 380));
  return { left, top };
};

// The expanded card for a schedule bar. `info` comes from taskCardInfo().
export default function TaskPopover({ info, anchor, onClose, onOpenWorksheet, onReassign, teammates = [] }) {
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!info) return null;
  const pos = popoverPosition(anchor, window.innerWidth, window.innerHeight);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
      <div
        role="dialog"
        aria-label={info.title}
        data-testid="task-popover"
        style={{
          position: "fixed", zIndex: 61, left: pos.left, top: pos.top, width: W, maxWidth: "calc(100vw - 24px)",
          maxHeight: "calc(100vh - 24px)", overflow: "auto", boxSizing: "border-box", padding: 20, borderRadius: 12,
          background: "#fff", boxShadow: SHADOW, display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <h3 style={{ margin: 0, font: "var(--type-heading-sm)", color: "var(--neutral-900)", textWrap: "pretty" }}>{info.title}</h3>
            <span style={{ fontSize: 14, lineHeight: "18px", color: "var(--neutral-500)" }}>{info.when}</span>
            <span style={{ fontSize: 12, lineHeight: "14px", color: "var(--neutral-400)" }}>{info.span}</span>
          </div>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{ width: 28, height: 28, flexShrink: 0, margin: "-4px -6px 0 0", border: "none", borderRadius: 7, background: "transparent", color: "var(--neutral-500)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {info.tags.map((t) => (
            <span key={t.l} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 9999, background: t.bg, color: t.fg, font: "600 12px/16px var(--font-ui)" }}>
              <span style={{ width: 6, height: 6, borderRadius: 9999, background: t.dot }} />
              {t.l}
            </span>
          ))}
        </div>

        <button
          type="button" onClick={onOpenWorksheet}
          style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 8, height: 36, padding: "0 14px", border: "none", borderRadius: 7, background: "var(--brand-500)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          <Table2 size={16} />
          Open in Work sheet
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "var(--neutral-700)" }}>
            <Info size={14} style={{ color: "var(--neutral-500)" }} />
            Details
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", columnGap: 16, rowGap: 8, fontSize: 13, lineHeight: "18px" }}>
            <span style={{ color: "var(--neutral-500)" }}>Assignee</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, color: "var(--neutral-900)" }}>
              <span style={{ width: 20, height: 20, flexShrink: 0, borderRadius: 9999, background: "var(--brand-50)", color: "var(--brand-700)", font: "600 9px/20px var(--font-ui)", textAlign: "center" }}>{info.ini}</span>
              {info.who}
            </span>
            <span style={{ color: "var(--neutral-500)" }}>Project</span>
            <span style={{ color: "var(--neutral-900)", textWrap: "pretty" }}>{info.project}</span>
            <span style={{ color: "var(--neutral-500)" }}>Load</span>
            <span style={{ color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums" }}>{info.load}</span>
            {info.change && (
              <>
                <span style={{ color: "var(--neutral-500)" }}>Change</span>
                <span style={{ color: "var(--neutral-900)", textWrap: "pretty" }}>{info.change}</span>
              </>
            )}
          </div>
        </div>

        {info.canReassign && !choosing && (
          <button
            type="button" onClick={() => setChoosing(true)}
            style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 8px", marginLeft: -8, border: "none", borderRadius: 7, background: "transparent", color: "var(--brand-500)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <RefreshCw size={14} />
            Reassign to someone else
          </button>
        )}
        {info.canReassign && choosing && (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {teammates.length === 0 && <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>No one else in this team.</span>}
            {teammates.map((name) => (
              <button
                key={name} type="button" onClick={() => onReassign(name)}
                style={{ textAlign: "left", height: 32, padding: "0 8px", border: "none", borderRadius: 7, background: "transparent", color: "var(--neutral-900)", fontSize: 13, cursor: "pointer" }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
