import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  MessageSquare,
  Pin,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import { NOTE_REASONS } from "@/lib/planning/seed";
import { fmtH, initials } from "@/lib/planning/planningLogic";
import { acceptTask, askAboutTask, declineTask, usePlanningStore } from "@/services/planningApi";

// "Task assigned to you": a sticky-note card that stacks pending assignments,
// with Accept / Decline / Ask a question, and a "N tasks waiting" pill once it
// is minimised. Follows the design prototype. The queue comes from
// services/planningApi.js (/api/planning/my-tasks).

const AMBER_TEXT = "rgb(120,53,15)";
const AMBER_LINE = "rgb(252,211,77)";
const POTENTIAL_HOURS = 8.5;

const DUE_TONE = {
  urgent: ["var(--error-50)", "rgb(153,27,27)", "inset 0 0 0 1px rgb(252,165,165)"],
  soon: ["var(--warning-100)", "rgb(146,64,14)", "inset 0 0 0 1px rgb(252,211,77)"],
  ok: ["var(--neutral-100)", "var(--neutral-700)", "none"],
};

const iconButton = {
  width: 28,
  height: 28,
  border: "none",
  borderRadius: 7,
  background: "transparent",
  color: AMBER_TEXT,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const TEXTAREA = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  border: "none",
  borderRadius: 7,
  background: "#fff",
  boxShadow: "inset 0 0 0 1px var(--neutral-200)",
  font: "400 14px/20px var(--font-core)",
  color: "var(--neutral-900)",
  resize: "vertical",
  outline: "none",
};

const ghostButton = {
  height: 36,
  padding: "0 10px",
  marginLeft: -10,
  border: "none",
  borderRadius: 7,
  background: "transparent",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const Panel = ({ children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16, borderRadius: 10, background: "#fff", boxShadow: "inset 0 0 0 1px rgb(234,238,244)" }}>
    {children}
  </div>
);

const StatCell = ({ icon: Icon, label, value, divider }) => (
  <div style={{ flex: "1 1 120px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4, padding: "12px 14px", boxShadow: divider ? "inset 1px 0 0 rgb(234,238,244)" : "none" }}>
    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, lineHeight: "14px", color: "var(--neutral-500)" }}>
      <Icon size={12} />
      {label}
    </span>
    <span style={{ fontSize: 14, lineHeight: "18px", fontWeight: 600, color: "var(--neutral-900)" }}>{value}</span>
  </div>
);

function TaskCard({ queue, onMinimise }) {
  const [idx, setIdx] = useState(0);
  const [mode, setMode] = useState(null); // null | "decline" | "ask"
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");

  const i = Math.min(idx, queue.length - 1);
  const n = queue[i];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onMinimise();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onMinimise]);

  const reset = () => {
    setMode(null);
    setReason("");
    setMsg("");
  };
  const go = (to) => {
    setIdx((to + queue.length) % queue.length);
    reset();
  };

  const first = n.from.split(" ")[0];
  const after = n.load + n.est;
  const pct = Math.round((after / POTENTIAL_HOURS) * 100);
  const over = pct > 100;
  const before = Math.min(100, (n.load / POTENTIAL_HOURS) * 100);
  const added = Math.max(0, Math.min(100, (after / POTENTIAL_HOURS) * 100) - before);
  const tone = DUE_TONE[n.dueTone || "ok"];
  const p1 = n.pri === "P1";
  const LoadIcon = over ? AlertTriangle : Check;

  const accept = async () => {
    if (!(await acceptTask(n.id))) return;
    reset();
    toast.success("Accepted · “" + n.task + "” added to your Work sheet");
  };
  const sendDecline = async () => {
    if (!reason) return toast.message("Choose a reason first");
    if (!(await declineTask(n.id, reason, msg.trim()))) return;
    reset();
    toast.success("Declined · " + first + " has been notified");
  };
  const sendAsk = async () => {
    if (!msg.trim()) return toast.message("Type your question first");
    if (!(await askAboutTask(n.id, msg.trim()))) return;
    reset();
    toast.success("Question sent to " + first + " · task stays in your queue");
  };

  return (
    <>
      <div onClick={onMinimise} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(12,12,13,0.1)" }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={"Task assigned by " + n.from}
        data-testid="task-card"
        style={{
          position: "fixed",
          zIndex: 81,
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: "clamp(420px,45vw,640px)",
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 48px)",
          display: "flex",
        }}
      >
        {queue.length > 2 && (
          <div style={{ position: "absolute", left: 28, right: 28, bottom: -16, height: 40, borderRadius: 12, background: "rgb(253,230,138)" }} />
        )}
        {queue.length > 1 && (
          <div style={{ position: "absolute", left: 14, right: 14, bottom: -8, height: 40, borderRadius: 12, background: "rgb(254,240,180)" }} />
        )}
        <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", borderRadius: 12, background: "rgb(255,251,235)", boxShadow: "0 6px 25px rgba(13,28,61,0.14)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, height: 44, padding: "0 8px 0 20px", background: "rgb(254,243,199)", boxShadow: "inset 0 -1px 0 " + AMBER_LINE }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, font: "700 11px/16px var(--font-ui)", letterSpacing: "0.06em", textTransform: "uppercase", color: AMBER_TEXT }}>
              <Pin size={14} />
              Task assigned to you
            </span>
            <span style={{ flex: 1 }} />
            {queue.length > 1 && (
              <>
                <button type="button" aria-label="Previous task" className="pp-hv-amber" onClick={() => go(i - 1)} style={iconButton}>
                  <ChevronLeft size={16} />
                </button>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {queue.map((x, k) => (
                    <button
                      key={x.id}
                      type="button"
                      aria-label={"Task " + (k + 1)}
                      onClick={() => go(k)}
                      style={{ width: k === i ? 16 : 6, height: 6, padding: 0, border: "none", borderRadius: 9999, background: k === i ? "rgb(146,64,14)" : AMBER_LINE, cursor: "pointer", transition: "background 120ms ease" }}
                    />
                  ))}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: AMBER_TEXT, minWidth: 40, textAlign: "center" }}>
                  {i + 1} of {queue.length}
                </span>
                <button type="button" aria-label="Next task" className="pp-hv-amber" onClick={() => go(i + 1)} style={iconButton}>
                  <ChevronRight size={16} />
                </button>
                <span style={{ width: 1, height: 20, background: AMBER_LINE, margin: "0 4px" }} />
              </>
            )}
            <button
              type="button"
              aria-label="Minimise"
              title="Minimise · decide later"
              className="pp-hv-amber"
              onClick={onMinimise}
              style={{ ...iconButton, width: 32, height: 32 }}
            >
              <ChevronDown size={16} />
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9999, background: "var(--brand-50)", color: "var(--brand-700)", font: "600 11px/32px var(--font-ui)", textAlign: "center" }}>
                {initials(n.from)}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", color: "var(--neutral-700)" }}>
                <span style={{ fontWeight: 600, color: "var(--neutral-900)" }}>{n.from}</span> · {n.role}
              </span>
              <span style={{ fontSize: 12, color: "var(--neutral-500)", whiteSpace: "nowrap" }}>{n.ago}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <h2 style={{ margin: 0, font: "var(--type-heading-md)", color: "var(--neutral-900)", textWrap: "pretty" }}>{n.task}</h2>
              <span style={{ fontSize: 14, lineHeight: "18px", color: "var(--neutral-500)" }}>
                {n.proj} · {n.client}
              </span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 9999, font: "600 12px/16px var(--font-ui)", whiteSpace: "nowrap", background: tone[0], color: tone[1], boxShadow: tone[2] }}>
                  <Clock size={12} />
                  {"Due " + n.dueIn}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "3px 10px",
                    borderRadius: 9999,
                    font: "600 12px/16px var(--font-ui)",
                    whiteSpace: "nowrap",
                    background: p1 ? "var(--error-50)" : "var(--neutral-100)",
                    color: p1 ? "rgb(153,27,27)" : "var(--neutral-700)",
                    boxShadow: p1 ? "inset 0 0 0 1px rgb(252,165,165)" : "none",
                  }}
                >
                  {p1 ? "High priority" : "Normal priority"}
                </span>
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--neutral-500)" }}>Brief</span>
              <p style={{ margin: 0, fontSize: 15, lineHeight: "22px", color: "var(--neutral-900)", textWrap: "pretty" }}>{n.note}</p>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", borderRadius: 10, background: "#fff", boxShadow: "inset 0 0 0 1px rgb(234,238,244)" }}>
              <StatCell icon={Calendar} label="Due" value={n.due} />
              <StatCell icon={Clock} label="Estimate" value={fmtH(n.est)} divider />
              <StatCell icon={Layers} label="Quantity" value={n.qty} divider />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--neutral-900)" }}>My day if I accept</span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: over ? "rgb(153,27,27)" : "rgb(0,91,75)" }}>
                  <LoadIcon size={12} />
                  {(over ? "Over capacity" : "Fits your day") + " · " + pct + "%"}
                </span>
              </span>
              <span style={{ display: "flex", height: 8, borderRadius: 9999, background: "rgb(254,243,199)", overflow: "hidden" }}>
                <span style={{ width: before + "%", background: "var(--neutral-400)" }} />
                <span style={{ width: added + "%", background: over ? "var(--error-500)" : "var(--success-500)" }} />
              </span>
              <span style={{ fontSize: 12, lineHeight: "16px", color: "var(--neutral-500)" }}>
                {fmtH(n.load) + " already planned + " + fmtH(n.est) + " from this task = " + fmtH(after) + " of " + fmtH(POTENTIAL_HOURS)}
              </span>
            </div>

            {mode === "decline" && (
              <Panel>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--neutral-900)" }}>Why are you declining?</span>
                <div role="radiogroup" aria-label="Decline reason" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {NOTE_REASONS.map((r) => {
                    const on = r === reason;
                    return (
                      <button
                        key={r}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setReason(r)}
                        style={{
                          height: 32,
                          padding: "0 12px",
                          border: "none",
                          borderRadius: 9999,
                          background: on ? "var(--brand-50)" : "#fff",
                          boxShadow: on ? "inset 0 0 0 2px var(--brand-500)" : "inset 0 0 0 1px var(--neutral-200)",
                          color: on ? "var(--brand-700)" : "var(--neutral-700)",
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "box-shadow 120ms ease",
                        }}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
                <textarea
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  rows={3}
                  placeholder={"Add a note for " + first + " (optional)"}
                  className="pp-focus"
                  style={TEXTAREA}
                />
              </Panel>
            )}
            {mode === "ask" && (
              <Panel>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "var(--neutral-900)" }}>{"Ask " + first + " a question"}</span>
                  <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>The task stays in your queue until you accept or decline.</span>
                </span>
                <textarea
                  value={msg}
                  onChange={(e) => setMsg(e.target.value)}
                  rows={3}
                  placeholder="e.g. Should the taglines be in Hindi too?"
                  className="pp-focus"
                  style={TEXTAREA}
                />
              </Panel>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 24px", background: "#fff", boxShadow: "inset 0 1px 0 rgb(234,238,244)", flexWrap: "wrap" }}>
            {!mode && (
              <>
                <button
                  type="button"
                  className="pp-hv-b50"
                  onClick={() => {
                    setMode("ask");
                    setMsg("");
                  }}
                  style={{ ...ghostButton, display: "flex", alignItems: "center", gap: 6, color: "var(--brand-500)" }}
                >
                  <MessageSquare size={14} />
                  Ask a question
                </button>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  className="pp-hv-n50"
                  onClick={() => {
                    setMode("decline");
                    setReason("");
                    setMsg("");
                  }}
                  style={{ height: 40, padding: "0 18px", border: "none", borderRadius: 7, background: "#fff", boxShadow: "inset 0 0 0 1px var(--neutral-200)", color: "var(--neutral-900)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  Decline
                </button>
                <button
                  type="button"
                  className="pp-hv-b400"
                  onClick={accept}
                  style={{ display: "flex", alignItems: "center", gap: 6, height: 40, padding: "0 22px", border: "none", borderRadius: 7, background: "var(--brand-500)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >
                  <Check size={16} />
                  Accept
                </button>
              </>
            )}
            {mode === "decline" && (
              <>
                <button type="button" className="pp-hv-n50" onClick={reset} style={{ ...ghostButton, color: "var(--neutral-700)" }}>
                  Cancel
                </button>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={sendDecline}
                  style={{ height: 40, padding: "0 20px", border: "none", borderRadius: 7, background: "var(--error-500)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: reason ? 1 : 0.45 }}
                >
                  Send decline
                </button>
              </>
            )}
            {mode === "ask" && (
              <>
                <button type="button" className="pp-hv-n50" onClick={reset} style={{ ...ghostButton, color: "var(--neutral-700)" }}>
                  Cancel
                </button>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  className="pp-hv-b400"
                  onClick={sendAsk}
                  style={{ display: "flex", alignItems: "center", gap: 6, height: 40, padding: "0 20px", border: "none", borderRadius: 7, background: "var(--brand-500)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: msg.trim() ? 1 : 0.45 }}
                >
                  <Send size={14} />
                  Send question
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Rendered once in the app layout. Hidden while the queue is empty.
export default function TaskCardHost() {
  const { notes } = usePlanningStore("cards");
  const [open, setOpen] = useState(true);

  if (!notes.length) return null;

  if (!open) {
    return (
      <button
        type="button"
        data-testid="task-card-pill"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 24,
          bottom: 24,
          zIndex: 70,
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: 44,
          padding: "0 6px 0 14px",
          border: "none",
          borderRadius: 9999,
          background: "rgb(254,243,199)",
          boxShadow: "inset 0 0 0 1px " + AMBER_LINE + ", 0 6px 15px rgba(13,28,61,0.12)",
          color: AMBER_TEXT,
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <Pin size={16} />
        {notes.length + (notes.length === 1 ? " task waiting" : " tasks waiting")}
        <span style={{ height: 32, padding: "0 12px", borderRadius: 9999, background: "var(--brand-500)", color: "#fff", fontSize: 13, lineHeight: "32px" }}>Review</span>
      </button>
    );
  }

  return <TaskCard queue={notes} onMinimise={() => setOpen(false)} />;
}
