import { useCallback, useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/work-sheet/SearchableSelect";
import { useUser } from "@/context/UserContext";
import { getDeliverables, getProjects } from "@/services/api";
import { getAssignable, getDeliverableTypes, getReviewQueue, rejectReviewItem, resolveReviewItem } from "@/services/planningApi";

const CARD = { background: "#fff", borderRadius: 12, boxShadow: "inset 0 0 0 1px rgb(234,238,244)", display: "flex", flexDirection: "column", minWidth: 0 };
// Same look as the other pills on this page; the list itself is the Work Sheet's searchable dropdown.
const TRIGGER = "bg-white shadow-[inset_0_0_0_1px_var(--neutral-200)] disabled:opacity-50";
const BTN = { height: 32, padding: "0 14px", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

const errText = (err, fallback) => {
  const d = err?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};

function HeldRow({ item, projects, types, onDone }) {
  const { currentUser } = useUser();
  const [projectId, setProjectId] = useState(item.project_id || "");
  const [deliverableId, setDeliverableId] = useState(item.deliverable_id || "");
  const [deliverables, setDeliverables] = useState([]);
  // what the matcher read from the line; the manager can change it or set it
  const [deliverableType, setDeliverableType] = useState(item.deliverable_type || "");
  const [busy, setBusy] = useState(false);
  const [openSelect, setOpenSelect] = useState(null);
  // A line under a "Team" heading (or any name PMT does not know) has nobody to
  // send it to: the manager picks who, one or several.
  const needsAssignee = !item.assignee_user_id;
  const [people, setPeople] = useState([]);
  const [chosen, setChosen] = useState([]);

  useEffect(() => {
    if (!needsAssignee || !item.team) return undefined;
    let cancelled = false;
    getAssignable(item.team)
      .then((rows) => {
        if (cancelled) return;
        setPeople(rows);
        // default owner of a Team line: the manager who posted the list
        const poster = item.assigned_by_user_id;
        if (poster && rows.some((r) => r.id === poster)) setChosen((cur) => (cur.length ? cur : [poster]));
      })
      .catch(() => !cancelled && setPeople([]));
    return () => {
      cancelled = true;
    };
  }, [needsAssignee, item.team, item.assigned_by_user_id]);

  const toggle = (id) => setChosen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  // the first person picked owns the task; the rest of the team are its collaborators
  const addWholeTeam = () => setChosen((cur) => [...cur, ...people.map((p) => p.id).filter((id) => !cur.includes(id))]);
  // Work with no project (hiring, interviews) is placed by its type alone.
  const ready = (!!projectId || !!deliverableType) && (!needsAssignee || chosen.length > 0);

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
      const body = { project_id: projectId || null, deliverable_id: deliverableId || null, deliverable_type: deliverableType || null };
      if (needsAssignee) {
        body.assignee_user_id = chosen[0];
        body.collaborator_user_ids = chosen.slice(1);
      }
      await resolveReviewItem(item.id, body);
      const names = needsAssignee
        ? people.filter((p) => chosen.includes(p.id)).map((p) => p.name).join(", ")
        : item.assignee_pmt_name || item.assignee_name || "the assignee";
      toast.success("Task sent to " + names);
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
        <SearchableSelect
          open={openSelect === "project"}
          onOpenChange={(o) => setOpenSelect(o ? "project" : null)}
          value={projectId}
          onValueChange={(v) => { setProjectId(v); setDeliverableId(""); }}
          options={[{ value: "", label: "No project (hiring, meetings…)" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
          placeholder="Choose a project…"
          searchPlaceholder="Search project..."
          emptyText="No projects found"
          className={TRIGGER}
          triggerProps={{ "aria-label": "Project" }}
          contentClassName="w-[400px] p-0"
        />
        <SearchableSelect
          open={openSelect === "deliverable"}
          onOpenChange={(o) => setOpenSelect(o ? "deliverable" : null)}
          value={deliverableId}
          onValueChange={setDeliverableId}
          options={[{ value: "", label: "No deliverable yet" }, ...deliverables.map((d) => ({ value: d.id, label: d.name, chip: d.deliverable_type }))]}
          placeholder="No deliverable yet"
          searchPlaceholder="Search deliverable..."
          emptyText="No deliverables found"
          disabled={!projectId}
          className={TRIGGER}
          triggerProps={{ "aria-label": "Deliverable" }}
          contentClassName="w-[400px] p-0"
        />
        <SearchableSelect
          open={openSelect === "type"}
          onOpenChange={(o) => setOpenSelect(o ? "type" : null)}
          value={deliverableType}
          onValueChange={setDeliverableType}
          options={[{ value: "", label: "No type chosen" }, ...types.map((t) => ({ value: t, label: t }))]}
          placeholder="Deliverable type…"
          searchPlaceholder="Search type..."
          emptyText="No types found"
          className={TRIGGER}
          triggerProps={{ "aria-label": "Deliverable type" }}
          contentClassName="w-[400px] p-0"
        />
      </div>
      {needsAssignee && (
        <div data-testid="held-assignees" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>
            Nobody is named on this line ("{item.assignee_name}"). Pick who owns it first; anyone else you add is tagged as a collaborator.
          </span>
          <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {people.map((p) => {
              const on = chosen.includes(p.id);
              return (
                <button
                  key={p.id} type="button" aria-pressed={on} onClick={() => toggle(p.id)}
                  style={{ ...BTN, height: 28, padding: "0 10px", background: on ? "var(--brand-500)" : "#fff", color: on ? "#fff" : "var(--neutral-900)", boxShadow: on ? "none" : "inset 0 0 0 1px var(--neutral-200)" }}
                >
                  {p.name}{on && chosen[0] === p.id ? " · owner" : ""}
                </button>
              );
            })}
            <button
              type="button" disabled={chosen.length === 0} onClick={addWholeTeam}
              style={{ ...BTN, height: 28, padding: "0 10px", background: "#fff", color: chosen.length === 0 ? "var(--neutral-400)" : "var(--brand-500)", boxShadow: "inset 0 0 0 1px var(--neutral-200)" }}
            >
              Add the whole team
            </button>
          </span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" disabled={!ready || busy} onClick={confirm} style={{ ...BTN, background: !ready || busy ? "var(--neutral-200)" : "var(--brand-500)", color: !ready || busy ? "var(--neutral-400)" : "#fff" }}>
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
  const [types, setTypes] = useState([]);

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
    getDeliverableTypes().then((rows) => !cancelled && setTypes(Array.isArray(rows) ? rows : [])).catch(() => !cancelled && setTypes([]));
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
            WhatsApp lines that could not be placed with confidence. Nobody receives these until you pick the project (or, for work with no project such as hiring, the deliverable type), or reject the line.
          </span>
        </div>
        <span style={{ padding: "2px 8px", borderRadius: 9999, background: "var(--warning-100)", color: "rgb(146,64,14)", font: "600 11px/16px var(--font-ui)" }}>
          {items.length} waiting
        </span>
      </summary>
      {items.map((item) => (
        <HeldRow key={item.id} item={item} projects={projects} types={types} onDone={done} />
      ))}
    </details>
  );
}
