import { useMemo, useState } from "react";
import { ExternalLink, Lock, X } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "./StatusBadge";
import { canEditWorkItem, isRowLockedForMember } from "@/lib/worksheetPermissions";
import { lowTimeMessage, parseTimeInput } from "@/lib/timeRules";

// The Work sheet on a phone. The desktop sheet is a 17-column spreadsheet; on a
// 375px screen that is unusable, so phones get one card per row and a bottom
// sheet for the fields people actually change on the move (status, time,
// remarks, link). Everything goes through the same onUpdate as the sheet, so
// every rule (reviewer needed, deliverable needed, time needed) still applies.
// Picking a project / deliverable stays in Quick log and on desktop.

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const fmtMinutes = (minutes) => {
  const m = Math.round(Number(minutes) || 0);
  if (!m) return "No time";
  const h = Math.floor(m / 60);
  return h ? `${h}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m}m`;
};

const STAGE_DOT = {
  Content: "bg-[#2b2bb5]",
  Design: "bg-blue-500",
  Animate: "bg-amber-500",
};

const FIELD =
  "w-full rounded-lg border border-[#d9deea] bg-white px-3 py-2.5 text-slate-900 outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/15 disabled:bg-slate-50 disabled:text-slate-500";

function EditSheet({ item, labels, options, editable, onClose, onSave }) {
  const [status, setStatus] = useState(item.status || "Not Started");
  const [time, setTime] = useState(String(item.time_taken_minutes ?? 0));
  const [remarks, setRemarks] = useState(item.remarks || "");
  const [link, setLink] = useState(item.deliverable_link || "");
  const [version, setVersion] = useState(item.version || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const parsed = parseTimeInput(time);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }

    const patch = {};
    if (status !== (item.status || "Not Started")) patch.status = status;
    if (parsed.minutes !== Number(item.time_taken_minutes || 0)) {
      const message = lowTimeMessage(
        parsed.minutes,
        item.time_benchmark_minutes,
        item.deliverable_type
      );
      if (message) {
        setError(message);
        return;
      }
      patch.time_taken_minutes = parsed.minutes;
    }
    if (remarks !== (item.remarks || "")) patch.remarks = remarks;
    if (link !== (item.deliverable_link || "")) patch.deliverable_link = link;
    if (version !== (item.version || "")) patch.version = version;

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const result = await onSave(item.id, patch);
      if (result && result.success === false) {
        // onUpdate has already told the person why (a toast)
        setSaving(false);
        return;
      }
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save this row");
      setSaving(false);
    }
  };

  const label = "mb-1 block text-xs font-medium text-[#546490]";

  return (
    <div className="fixed inset-0 z-[70] md:hidden" role="dialog" aria-modal="true" aria-label="Edit row">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} aria-hidden="true" />

      <div className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(13,28,61,0.18)]">
        <div className="flex items-start gap-3 px-4 pb-2 pt-4">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-slate-900">
              {labels.project}
            </div>
            <div className="truncate text-[13px] text-[#546490]">{labels.deliverable}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-3">
          {!editable && (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">
              <Lock className="h-4 w-4 shrink-0" />
              This row is read-only for you.
            </div>
          )}

          <div>
            <label className={label} htmlFor="mw-status">Status</label>
            <select
              id="mw-status"
              className={FIELD}
              value={status}
              disabled={!editable}
              onChange={(e) => setStatus(e.target.value)}
            >
              {(options.statuses || []).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="mw-time">Time (minutes)</label>
              <input
                id="mw-time"
                className={FIELD}
                inputMode="decimal"
                value={time}
                disabled={!editable}
                onChange={(e) => {
                  setTime(e.target.value);
                  setError("");
                }}
              />
            </div>
            <div>
              <label className={label} htmlFor="mw-version">Version</label>
              <input
                id="mw-version"
                className={FIELD}
                value={version}
                disabled={!editable}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="-mt-1 text-[13px] text-red-600">{error}</p>}

          <div>
            <label className={label} htmlFor="mw-link">Deliverable link</label>
            <input
              id="mw-link"
              className={FIELD}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              value={link}
              disabled={!editable}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://"
            />
          </div>

          <div>
            <label className={label} htmlFor="mw-remarks">Remarks</label>
            <textarea
              id="mw-remarks"
              rows={3}
              className={FIELD}
              value={remarks}
              disabled={!editable}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
        </div>

        <div className="flex gap-2 border-t border-[#eaeef4] px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl border border-[#d9deea] text-[15px] font-medium text-slate-700 active:bg-slate-50"
          >
            {editable ? "Cancel" : "Close"}
          </button>
          {editable && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="h-11 flex-1 rounded-xl bg-[#2b2bb5] text-[15px] font-semibold text-white active:bg-[#1a1a8a] disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function MobileWorkList({
  items,
  currentUser,
  users = [],
  options = {},
  projects = [],
  deliverables = [],
  clients = [],
  hiddenRows = [],
  onUpdate,
}) {
  const [editingId, setEditingId] = useState(null);

  const usersById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const projectsById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const deliverablesById = useMemo(
    () => Object.fromEntries(deliverables.map((d) => [d.id, d])),
    [deliverables]
  );
  const clientsById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);

  const visible = useMemo(
    () => items.filter((item) => !hiddenRows.includes(item.id)),
    [items, hiddenRows]
  );

  const isMember = currentUser.role === "member";
  const memberStage = { Content: "Content", Design: "Design", Animation: "Animate" }[
    currentUser.department
  ];
  const canEdit = (item) =>
    isMember
      ? (!item.stage || item.stage === memberStage) &&
        !isRowLockedForMember(currentUser, item, users)
      : canEditWorkItem(currentUser, item, users);

  const labelsFor = (item) => {
    const project = projectsById[item.project_id];
    const deliverable = deliverablesById[item.deliverable_id];
    const client = clientsById[item.client_id || project?.client_id];
    return {
      project: project?.name || "No project yet",
      client: client?.name || "",
      deliverable:
        deliverable?.name || item.deliverable_name || (item.deliverable_id ? "" : "No deliverable yet"),
    };
  };

  const editing = visible.find((i) => i.id === editingId) || null;

  if (visible.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
        <div className="text-[15px] font-semibold text-slate-800">No rows here</div>
        <div className="text-[13px] text-[#546490]">
          Use Quick log to add what you worked on, or change the filters.
        </div>
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto bg-[#f7f9fc] px-3 py-3 pb-24" data-testid="mobile-worklist">
        {visible.map((item) => {
          const labels = labelsFor(item);
          const editable = canEdit(item);
          const creator = usersById[item.creator_id]?.name;

          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setEditingId(item.id)}
                className="flex w-full flex-col gap-1.5 rounded-xl border border-[#eaeef4] bg-white p-3 text-left shadow-sm active:bg-[#f0f0fd]"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold text-slate-900">
                      {labels.project}
                    </div>
                    {labels.client && (
                      <div className="truncate text-xs text-[#546490]">{labels.client}</div>
                    )}
                  </div>
                  <StatusBadge status={item.status || "Not Started"} />
                </div>

                {labels.deliverable && (
                  <div className="truncate text-[13px] text-slate-700">{labels.deliverable}</div>
                )}

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#546490]">
                  {item.stage && (
                    <span className="inline-flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full ${STAGE_DOT[item.stage] || "bg-slate-400"}`} />
                      {item.stage}
                    </span>
                  )}
                  <span>{fmtMinutes(item.time_taken_minutes)}</span>
                  {item.work_date && <span>{fmtDate(item.work_date)}</span>}
                  {creator && creator !== currentUser.name && <span>{creator}</span>}
                  {item.deliverable_link && <ExternalLink className="h-3.5 w-3.5" aria-label="Has link" />}
                  {!editable && <Lock className="h-3.5 w-3.5" aria-label="Read only" />}
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {editing && (
        <EditSheet
          key={editing.id}
          item={editing}
          labels={labelsFor(editing)}
          options={options}
          editable={canEdit(editing)}
          onClose={() => setEditingId(null)}
          onSave={onUpdate}
        />
      )}
    </>
  );
}

export default MobileWorkList;
