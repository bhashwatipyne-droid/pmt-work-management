import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronRight, Folder, MessageSquareText, Send } from "lucide-react";
import { toast } from "sonner";

import { SearchableSelect } from "@/components/work-sheet/SearchableSelect";
import { useUser } from "@/context/UserContext";
import { getDeliverables, getProjects } from "@/services/api";
import { getAssignable, getDeliverableTypes, getReviewQueue, rejectReviewItem, resolveReviewItem } from "@/services/planningApi";

const CARD = { background: "#fff", borderRadius: 12, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden", transition: "box-shadow 120ms ease" };
// Same look as the other pills on this page; the list itself is the Work Sheet's searchable dropdown.
const TRIGGER = "bg-white disabled:opacity-50";
const LABEL = { fontSize: 12, fontWeight: 600, color: "var(--neutral-700)" };
const PREVIEW = 3;

const FILTERS = [
  ["all", "All"],
  ["noproj", "Needs a project"],
  ["ambig", "Two matches"],
  ["weak", "Weak match"],
];

const errText = (err, fallback) => {
  const d = err?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
};

const nameOf = (item) => item.assignee_pmt_name || item.assignee_name || "";
const initials = (name) => (name.match(/\b\w/g) || []).slice(0, 2).join("").toUpperCase();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : "");
const shortDate = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso || "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

// How the matcher got stuck on a line. Drives the filter tabs.
const kindOf = (item) => {
  if (!item.project_id) return "noproj";
  if ((item.review_reasons || []).some((r) => /^ambiguous project/i.test(r))) return "ambig";
  return "weak";
};

// A line under a "Team" heading (or any name PMT does not know) has nobody to send it to.
const needsAssignee = (item) => !item.assignee_user_id;

// `pick` is the manager's current choice for the line. Work with no project (hiring,
// interviews) is placed by its deliverable type alone; a line with nobody named also needs an owner.
const isReady = (item, pick) => (!!pick.projectId || !!pick.deliverableType) && (!needsAssignee(item) || pick.chosen.length > 0);

// A reason that means nothing was found is red; the rest are cautions.
const isHardReason = (r) => /^(no |nothing )/i.test(r) || /not found|unresolved/i.test(r);

function Pill({ hard, children }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 9999,
        background: hard ? "var(--error-50)" : "var(--warning-100)", color: hard ? "rgb(153,27,27)" : "rgb(146,64,14)",
        boxShadow: hard ? "inset 0 0 0 1px rgb(252,165,165)" : "none", font: "600 11px/16px var(--font-ui)",
      }}
    >
      <AlertCircle className="h-3 w-3" />
      {children}
    </span>
  );
}

// `pick` is the manager's current choice: { projectId, deliverableId, deliverableType, chosen, skip }.
function HeldRow({ item, projects, types, pick, onPick, onReject, busy }) {
  const { currentUser } = useUser();
  const [deliverables, setDeliverables] = useState([]);
  const [people, setPeople] = useState([]);
  const [openSelect, setOpenSelect] = useState(null);
  const { projectId, deliverableId, deliverableType, chosen, skip } = pick;
  const ok = isReady(item, pick);
  const kind = kindOf(item);
  const askWho = needsAssignee(item);

  useEffect(() => {
    if (!askWho || !item.team) return undefined;
    let cancelled = false;
    getAssignable(item.team)
      .then((rows) => {
        if (cancelled) return;
        setPeople(rows);
        // default owner of a Team line: the manager who posted the list
        const poster = item.assigned_by_user_id;
        if (poster && rows.some((r) => r.id === poster)) onPick({ chosen: [poster] }, true);
      })
      .catch(() => !cancelled && setPeople([]));
    return () => {
      cancelled = true;
    };
    // onPick is recreated every render; the fetch only depends on the line
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askWho, item.team, item.assigned_by_user_id]);

  const toggle = (id) => onPick({ chosen: chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id] });
  // the first person picked owns the task; the rest of the team are its collaborators
  const addWholeTeam = () => onPick({ chosen: [...chosen, ...people.map((p) => p.id).filter((id) => !chosen.includes(id))] });

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

  // "Which project was meant?": the matcher's runner-ups that exist in the project list.
  const choices = useMemo(() => {
    if (kind !== "ambig") return [];
    const byName = new Map(projects.map((p) => [p.name, p]));
    const names = [item.project_name, ...(item.alternatives || []).map((a) => a.project)];
    return [...new Set(names)].map((n) => byName.get(n)).filter(Boolean);
  }, [kind, item, projects]);

  // The match score belongs to the matcher's own guess, so it hides once someone picks another project.
  const score = Math.round((item.confidence?.project || 0) * 100);
  const showScore = score > 0 && ok && projectId === item.project_id;

  const reasons = item.review_reasons || [];
  const checkLabel = !ok ? (askWho && (projectId || deliverableType) ? "Pick who it is for to include" : "Pick a project to include") : skip ? "Not included" : "Included in send";
  const checked = ok && !skip;

  return (
    <div data-testid="held-row" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 20, padding: 16, boxShadow: "inset 0 -1px 0 rgb(243,244,246)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 9999, background: "var(--brand-50)", color: "var(--brand-700)", font: "600 11px/28px var(--font-ui)", textAlign: "center" }}>
            {initials(nameOf(item))}
          </span>
          <span style={{ fontSize: 12, lineHeight: "16px", color: "var(--neutral-500)" }}>
            {nameOf(item)} · {cap(item.team) || "No team"} · {shortDate(item.work_date)}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, padding: "10px 12px", borderRadius: 8, background: "var(--neutral-50)" }}>
          <MessageSquareText className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[var(--neutral-400)]" />
          <span style={{ fontSize: 14, lineHeight: "20px", fontWeight: 500, color: "var(--neutral-900)", textWrap: "pretty", wordBreak: "break-word" }}>{item.raw_line}</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {reasons.map((r) => <Pill key={r} hard={isHardReason(r)}>{r}</Pill>)}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
        {choices.length > 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={LABEL}>Which project was meant?</span>
            {choices.map((p) => {
              const on = p.id === projectId;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick({ projectId: p.id, deliverableId: "" })}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, minHeight: 36, padding: "6px 10px", border: "none", borderRadius: 8, textAlign: "left", cursor: "pointer",
                    fontSize: 13, lineHeight: "18px", color: "var(--neutral-900)", background: on ? "var(--brand-50)" : "#fff",
                    boxShadow: on ? "inset 0 0 0 2px var(--brand-500)" : "inset 0 0 0 1px var(--neutral-200)", transition: "box-shadow 120ms ease",
                  }}
                >
                  <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--brand-500)]" />
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={LABEL}>Project</span>
            <SearchableSelect
              open={openSelect === "project"}
              onOpenChange={(o) => setOpenSelect(o ? "project" : null)}
              value={projectId}
              onValueChange={(v) => onPick({ projectId: v, deliverableId: "" })}
              options={[{ value: "", label: "No project (hiring, meetings…)" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
              placeholder="Choose a project"
              searchPlaceholder="Search project..."
              emptyText="No projects found"
              className={`${TRIGGER} ${projectId || deliverableType ? "shadow-[inset_0_0_0_1px_var(--neutral-200)]" : "shadow-[inset_0_0_0_1px_var(--warning-500)]"}`}
              triggerProps={{ "aria-label": "Project" }}
              contentClassName="w-[400px] p-0"
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={LABEL}>Deliverable</span>
            <SearchableSelect
              open={openSelect === "deliverable"}
              onOpenChange={(o) => setOpenSelect(o ? "deliverable" : null)}
              value={deliverableId}
              onValueChange={(v) => onPick({ deliverableId: v })}
              options={[{ value: "", label: "No deliverable yet" }, ...deliverables.map((d) => ({ value: d.id, label: d.name, chip: d.deliverable_type }))]}
              placeholder="No deliverable yet"
              searchPlaceholder="Search deliverable..."
              emptyText="No deliverables found"
              disabled={!projectId}
              className={`${TRIGGER} shadow-[inset_0_0_0_1px_var(--neutral-200)]`}
              triggerProps={{ "aria-label": "Deliverable" }}
              contentClassName="w-[400px] p-0"
            />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <span style={LABEL}>Deliverable type</span>
          <SearchableSelect
            open={openSelect === "type"}
            onOpenChange={(o) => setOpenSelect(o ? "type" : null)}
            value={deliverableType}
            onValueChange={(v) => onPick({ deliverableType: v })}
            options={[{ value: "", label: "No type chosen" }, ...types.map((t) => ({ value: t, label: t }))]}
            placeholder="No type chosen"
            searchPlaceholder="Search type..."
            emptyText="No types found"
            className={`${TRIGGER} shadow-[inset_0_0_0_1px_var(--neutral-200)]`}
            triggerProps={{ "aria-label": "Deliverable type" }}
            contentClassName="w-[400px] p-0"
          />
        </div>
        {askWho && (
          <div data-testid="held-assignees" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>
              Nobody is named on this line ("{item.assignee_name}"). Pick who owns it first; anyone else you add is tagged as a collaborator.
            </span>
            <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {people.map((p) => {
                const on = chosen.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(p.id)}
                    style={{ height: 28, padding: "0 10px", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", background: on ? "var(--brand-500)" : "#fff", color: on ? "#fff" : "var(--neutral-900)", boxShadow: on ? "none" : "inset 0 0 0 1px var(--neutral-200)" }}
                  >
                    {p.name}{on && chosen[0] === p.id ? " · owner" : ""}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={chosen.length === 0}
                onClick={addWholeTeam}
                style={{ height: 28, padding: "0 10px", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "#fff", color: chosen.length === 0 ? "var(--neutral-400)" : "var(--brand-500)", boxShadow: "inset 0 0 0 1px var(--neutral-200)" }}
              >
                Add the whole team
              </button>
            </span>
          </div>
        )}
        {showScore && (
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--neutral-500)" }}>
            <span style={{ width: 60, height: 4, borderRadius: 9999, background: "var(--neutral-100)", overflow: "hidden" }}>
              <span style={{ display: "block", height: "100%", width: `${score}%`, background: score >= 60 ? "var(--success-500)" : "var(--warning-500)" }} />
            </span>
            Best guess · {score}% match
          </span>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end", marginTop: "auto" }}>
          <button
            type="button"
            disabled={busy}
            onClick={onReject}
            className="hover:bg-[var(--error-50)] hover:text-[rgb(153,27,27)] disabled:opacity-50"
            style={{ height: 34, padding: "0 14px", border: "none", borderRadius: 7, background: "transparent", color: "var(--neutral-700)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Reject line
          </button>
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            disabled={!ok || busy}
            onClick={() => onPick({ skip: !skip })}
            className="hover:bg-[var(--brand-50)]"
            style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 10px", border: "none", borderRadius: 7, background: "transparent", color: checked ? "var(--brand-700)" : "var(--neutral-500)", fontSize: 13, fontWeight: 600, cursor: ok ? "pointer" : "default", opacity: ok ? 1 : 0.4 }}
          >
            <span style={{ width: 16, height: 16, borderRadius: 5.333, background: checked ? "var(--brand-500)" : "#fff", boxShadow: checked ? "none" : "inset 0 0 0 1.5px var(--neutral-300)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {checked && <Check className="h-3 w-3" />}
            </span>
            {checkLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Planning: WhatsApp tasklist lines the matcher held back. Hidden when there are none.
export default function HeldTasksPanel() {
  const { currentUser } = useUser();
  const [items, setItems] = useState(null);
  const [projects, setProjects] = useState([]);
  const [types, setTypes] = useState([]);
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const [picks, setPicks] = useState({}); // item id -> { projectId, deliverableId, skip }
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getReviewQueue()
      .then((rows) => !cancelled && setItems(rows))
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, []);

  // The project list is large, so it is only fetched once there is something to place and the panel is open.
  useEffect(() => {
    if (!open || !items || items.length === 0 || !currentUser?.id) return undefined;
    let cancelled = false;
    getDeliverableTypes().then((rows) => !cancelled && setTypes(Array.isArray(rows) ? rows : [])).catch(() => !cancelled && setTypes([]));
    getProjects(currentUser.id, { include_deliverables: false })
      .then((rows) => !cancelled && setProjects((Array.isArray(rows) ? rows : []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))))
      .catch(() => !cancelled && setProjects([]));
    return () => {
      cancelled = true;
    };
  }, [open, items, currentUser?.id]);

  const pickOf = useCallback(
    (item) => ({ projectId: item.project_id || "", deliverableId: item.deliverable_id || "", deliverableType: item.deliverable_type || "", chosen: [], skip: false, ...picks[item.id] }),
    [picks],
  );
  // `keepExisting` is for defaults: never overwrite a choice the manager already made.
  const setPick = (id, patch, keepExisting) => setPicks((cur) => (keepExisting && cur[id]?.chosen?.length ? cur : { ...cur, [id]: { ...cur[id], ...patch } }));
  const drop = useCallback((ids) => setItems((cur) => (cur || []).filter((i) => !ids.has(i.id))), []);
  const setBusy = (id, on) => setBusyIds((cur) => { const n = new Set(cur); if (on) n.add(id); else n.delete(id); return n; });

  const rejectLine = async (item) => {
    setBusy(item.id, true);
    try {
      await rejectReviewItem(item.id);
      drop(new Set([item.id]));
    } catch (err) {
      toast.error(errText(err, "Could not reject this line"));
    }
    setBusy(item.id, false);
  };

  const list = items || [];
  const ready = list.filter((i) => { const p = pickOf(i); return isReady(i, p) && !p.skip; });

  const sendAll = async () => {
    if (!ready.length) return;
    setSending(true);
    const sent = new Set();
    let failure = "";
    for (const item of ready) {
      const p = pickOf(item);
      try {
        const body = { project_id: p.projectId || null, deliverable_id: p.deliverableId || null, deliverable_type: p.deliverableType || null };
        if (needsAssignee(item)) {
          body.assignee_user_id = p.chosen[0];
          body.collaborator_user_ids = p.chosen.slice(1);
        }
        await resolveReviewItem(item.id, body);
        sent.add(item.id);
      } catch (err) {
        failure = failure || errText(err, "Could not send this line");
      }
    }
    if (sent.size) {
      drop(sent);
      toast.success(`${sent.size} ${sent.size === 1 ? "line" : "lines"} sent`);
    }
    if (failure) toast.error(`${ready.length - sent.size} not sent: ${failure}`);
    setSending(false);
  };

  // Keep the room while loading so the page below does not jump when it arrives.
  if (!items) return <div aria-hidden="true" style={{ minHeight: 72 }} />;
  if (items.length === 0) return null;

  const count = (k) => list.filter((i) => kindOf(i) === k).length;
  const filtered = filter === "all" ? list : list.filter((i) => kindOf(i) === filter);
  const shown = showAll ? filtered : filtered.slice(0, PREVIEW);
  const hasNoProject = list.some((i) => kindOf(i) === "noproj" && !isReady(i, pickOf(i)));
  const tone = hasNoProject
    ? { ring: "inset 0 0 0 1px rgb(234,238,244)", pillBg: "var(--error-50)", pillFg: "rgb(153,27,27)", pillRing: "inset 0 0 0 1px rgb(252,165,165)", head: "rgb(255,250,250)" }
    : { ring: "inset 0 0 0 1px var(--warning-500)", pillBg: "var(--warning-100)", pillFg: "rgb(146,64,14)", pillRing: "none", head: "rgb(255,252,240)" };
  const readyText = ready.length
    ? `${ready.length} of ${list.length} ready · ${new Set(ready.map((i) => pickOf(i).projectId).filter(Boolean)).size} projects · ${new Set(ready.map(nameOf)).size} people`
    : "Pick a project (or type) on each line to make it ready";
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <section data-testid="held-tasks" aria-label="Held tasklist items" style={{ ...CARD, boxShadow: tone.ring }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="hover:bg-[var(--neutral-50)]"
        style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, border: "none", background: tone.head, textAlign: "left", cursor: "pointer" }}
      >
        <Chevron className="h-4 w-4 shrink-0 text-[var(--neutral-500)]" />
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 16, lineHeight: "20px", fontWeight: 600, color: "var(--neutral-900)" }}>Held tasklist items</span>
          <span style={{ fontSize: 13, lineHeight: "18px", color: "var(--neutral-500)", textWrap: "pretty" }}>
            WhatsApp lines the system couldn’t place. No one receives them until you confirm a project or reject the line.
          </span>
        </span>
        <span style={{ padding: "3px 10px", borderRadius: 9999, background: tone.pillBg, color: tone.pillFg, boxShadow: tone.pillRing, font: "600 12px/16px var(--font-ui)", whiteSpace: "nowrap" }}>
          {list.length} waiting
        </span>
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", boxShadow: "inset 0 1px 0 rgb(234,238,244)" }}>
          <div style={{ padding: "10px 16px", background: "var(--neutral-50)", boxShadow: "inset 0 -1px 0 rgb(234,238,244)" }}>
            <div role="tablist" aria-label="Filter held lines" style={{ display: "inline-flex", flexWrap: "wrap", padding: 2, borderRadius: 8, background: "var(--neutral-100)" }}>
              {FILTERS.map(([k, label]) => {
                const on = k === filter;
                return (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => { setFilter(k); setShowAll(false); }}
                    style={{ height: 28, padding: "0 12px", border: "none", borderRadius: 7, background: on ? "#fff" : "transparent", boxShadow: on ? "0 1px 2px 0 rgba(13,28,61,0.05)" : "none", color: on ? "var(--neutral-900)" : "var(--neutral-500)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {label} · {k === "all" ? list.length : count(k)}
                  </button>
                );
              })}
            </div>
          </div>
          {filtered.length === 0 && <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--neutral-500)" }}>Nothing in this filter.</div>}
          {shown.map((item) => (
            <HeldRow
              key={item.id}
              item={item}
              projects={projects}
              types={types}
              pick={pickOf(item)}
              onPick={(patch, keepExisting) => setPick(item.id, patch, keepExisting)}
              onReject={() => rejectLine(item)}
              busy={sending || busyIds.has(item.id)}
            />
          ))}
          <div style={{ position: "sticky", bottom: 0, zIndex: 2, order: 99, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", background: "#fff", boxShadow: "inset 0 1px 0 rgb(234,238,244), 0 -4px 6px rgba(13,28,61,0.05)" }}>
            <span style={{ flex: 1, minWidth: 200, fontSize: 13, lineHeight: "18px", color: "var(--neutral-700)" }}>{readyText}</span>
            <button
              type="button"
              disabled={!ready.length || sending}
              onClick={sendAll}
              className="hover:bg-[var(--brand-400)] disabled:opacity-45"
              style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 18px", border: "none", borderRadius: 7, background: "var(--brand-500)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              <Send className="h-4 w-4" />
              {ready.length ? `Send ${ready.length} ${ready.length === 1 ? "line" : "lines"}` : "Send"}
            </button>
          </div>
          {filtered.length > PREVIEW && (
            <button type="button" onClick={() => setShowAll((s) => !s)} className="hover:bg-[var(--brand-50)]" style={{ height: 44, border: "none", background: "transparent", color: "var(--brand-500)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              {showAll ? "Show fewer" : `Show all ${filtered.length}`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
