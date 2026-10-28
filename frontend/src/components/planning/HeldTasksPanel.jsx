import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import { getDeliverables, getProjects } from "@/services/api";
import { getReviewQueue, rejectReviewItem, resolveReviewItem } from "@/services/planningApi";

const CARD = { background: "#fff", borderRadius: 12, boxShadow: "inset 0 0 0 1px rgb(234,238,244)", display: "flex", flexDirection: "column", minWidth: 0 };
const SELECT = {
  height: 32, minWidth: 0, width: "100%", padding: "0 8px", borderRadius: 7, border: "none", background: "#fff",
  boxShadow: "inset 0 0 0 1px var(--neutral-200)", color: "var(--neutral-900)", fontSize: 13, fontFamily: "inherit",
};
const BTN = { height: 32, padding: "0 14px", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

const errText = (err, fallback) => {
  const d = err?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};

function HeldRow({ item, projects, onDone }) {
  const { currentUser } = useUser();
  const [projectId, setProjectId] = useState(item.project_id || "");
  const [deliverableId, setDeliverableId] = useState(item.deliverable_id || "");
  const [deliverables, setDeliverables] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setDeliverables([]);
      return undefined;
    }
    let cancelled = false;
    getDeliverables(currentUser?.id, { project_id: projectId })
      .then((rows) => !cancelled && setDeliverables(Array.isArray(rows) ? rows : []))
      .catch(() => !cancelled && setDeliverables([]));
    return () => {
      cancelled = true;
    };
  }, [projectId, currentUser?.id]);

  const confirm = async () => {
    setBusy(true);
    try {
      await resolveReviewItem(item.id, { project_id: projectId, deliverable_id: deliverableId || null });
      toast.success("Task sent to " + (item.assignee_pmt_name || item.assignee_name || "the assignee"));
      onDone(item.id);
    } catch (err) {
      toast.error(errText(err, "Could not confirm this task"));
      setBusy(false);
    }
  };
  const reject = async () => {
    setBusy(true);
    try {
      await rejectReviewItem(item.id);
      onDone(item.id);
    } catch (err) {
      toast.error(errText(err, "Could not reject this task"));
      setBusy(false);
    }
  };

  return (
    <div data-testid="held-row" style={{ padding: "14px 16px", boxShadow: "inset 0 1px 0 rgb(243,244,246)", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--neutral-900)", textWrap: "pretty" }}>{item.raw_line}</span>
        <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>
          {item.assignee_pmt_name || item.assignee_name} · {item.team || "no team"} · {item.work_date}
        </span>
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(item.review_reasons || []).map((r) => (
            <span key={r} style={{ padding: "2px 8px", borderRadius: 9999, background: "var(--warning-100)", color: "rgb(146,64,14)", font: "600 11px/16px var(--font-ui)" }}>{r}</span>
          ))}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 8 }}>
        <select aria-label="Project" value={projectId} onChange={(e) => { setProjectId(e.target.value); setDeliverableId(""); }} style={SELECT}>
          <option value="">Choose a project…</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select aria-label="Deliverable" value={deliverableId} onChange={(e) => setDeliverableId(e.target.value)} disabled={!projectId} style={SELECT}>
          <option value="">No deliverable yet</option>
          {deliverables.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" disabled={!projectId || busy} onClick={confirm} style={{ ...BTN, background: !projectId || busy ? "var(--neutral-200)" : "var(--brand-500)", color: !projectId || busy ? "var(--neutral-400)" : "#fff" }}>
          Confirm and send
        </button>
        <button type="button" disabled={busy} onClick={reject} style={{ ...BTN, background: "#fff", boxShadow: "inset 0 0 0 1px var(--neutral-200)", color: "var(--neutral-900)" }}>
          Reject
        </button>
      </div>
    </div>
  );
}

// Planning: WhatsApp tasklist lines the matcher held back. Hidden when there are none.
export default function HeldTasksPanel() {
  const { currentUser } = useUser();
  const [items, setItems] = useState(null);
  const [projects, setProjects] = useState([]);
  // The project list is large, so it is only fetched once the panel is opened.
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getReviewQueue()
      .then((rows) => !cancelled && setItems(rows))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!opened || !items || items.length === 0 || !currentUser?.id) return undefined;
    let cancelled = false;
    getProjects(currentUser.id, { include_deliverables: false })
      .then((rows) => !cancelled && setProjects((Array.isArray(rows) ? rows : []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))))
      .catch(() => !cancelled && setProjects([]));
    return () => {
      cancelled = true;
    };
  }, [opened, items, currentUser?.id]);

  const done = useCallback((id) => setItems((cur) => (cur || []).filter((i) => i.id !== id)), []);

  // Keep the room while loading so the page below does not jump when it arrives.
  if (!items) return <div aria-hidden="true" style={{ minHeight: 72 }} />;
  if (items.length === 0) return null;
  return (
    <details data-testid="held-tasks" className="group" style={CARD} onToggle={(e) => e.currentTarget.open && setOpened(true)}>
      <summary style={{ padding: "16px 16px 12px", display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap", cursor: "pointer" }}>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(138,151,181)] transition-transform group-open:rotate-90" />
        <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 2 }}>
          <h2 style={{ margin: 0, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: "var(--neutral-900)" }}>Held tasklist items</h2>
          <span style={{ fontSize: 12, lineHeight: "16px", color: "var(--neutral-500)" }}>
            WhatsApp lines that could not be placed with confidence. Nobody receives these until you pick the project, or reject the line.
          </span>
        </div>
        <span style={{ padding: "2px 8px", borderRadius: 9999, background: "var(--warning-100)", color: "rgb(146,64,14)", font: "600 11px/16px var(--font-ui)" }}>
          {items.length} waiting
        </span>
      </summary>
      {items.map((item) => (
        <HeldRow key={item.id} item={item} projects={projects} onDone={done} />
      ))}
    </details>
  );
}
