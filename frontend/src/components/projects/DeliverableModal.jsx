import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import axios from "axios";
import { useUser } from "@/context/UserContext";
import { getOptions, API } from "@/services/api";

const inputBase = "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

export const DeliverableModal = ({ open, mode, projectId, initial, users, onClose, onSaved }) => {
  const { currentUserId } = useUser();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [startDt, setStartDt] = useState("");
  const [endDt, setEndDt] = useState("");
  const [stage, setStage] = useState("Content");
  const [stageStatus, setStageStatus] = useState("Not Started");
  const [types, setTypes] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { getOptions().then((o) => setTypes(o.deliverable_types || [])); }, []);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setName(initial.name || "");
      setType(initial.type || "");
      setOwnerId(initial.owner_id || "");
      setStartDt(initial.start_dt || "");
      setEndDt(initial.end_dt || "");
      setStage(initial.current_stage || "Content");
      setStageStatus(initial.stage_status || "Not Started");
    } else {
      setName(""); setType(""); setOwnerId(""); setStartDt(""); setEndDt("");
      setStage("Content"); setStageStatus("Not Started");
    }
  }, [open, mode, initial]);

  if (!open) return null;

  const submit = async () => {
    if (!name.trim()) return toast.error("Deliverable name required");
    setSubmitting(true);
    const headers = { "X-User-Id": currentUserId };
    try {
      if (mode === "edit") {
        const { data } = await axios.patch(`${API}/deliverables/${initial.id}`, {
          name: name.trim(),
          type,
          owner_id: ownerId || null,
          start_dt: startDt || null,
          end_dt: endDt || null,
        }, { headers });
        toast.success("Deliverable updated");
        onSaved?.(data);
      } else {
        const { data } = await axios.post(`${API}/deliverables`, {
          project_id: projectId,
          name: name.trim(),
          type,
          owner_id: ownerId || null,
          start_dt: startDt || null,
          end_dt: endDt || null,
          current_stage: stage,
          stage_status: stageStatus,
        }, { headers });
        toast.success("Deliverable added");
        onSaved?.(data);
      }
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6" onClick={onClose}>
      <div data-testid={mode === "edit" ? "deliverable-edit-modal" : "deliverable-add-modal"} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{mode === "edit" ? "Edit Deliverable" : "Add Deliverable"}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Name *</label>
            <input data-testid="deliverable-modal-name" value={name} onChange={(e) => setName(e.target.value)} className={inputBase} placeholder="e.g. Module 1 video" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Type</label>
              <select data-testid="deliverable-modal-type" value={type} onChange={(e) => setType(e.target.value)} className={inputBase}>
                <option value="">—</option>
                {types.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Owner</label>
              <select data-testid="deliverable-modal-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputBase}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Start · Date & Time</label>
              <input data-testid="deliverable-modal-start" type="datetime-local" value={startDt} onChange={(e) => setStartDt(e.target.value)} className={inputBase} />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">End · Date & Time</label>
              <input data-testid="deliverable-modal-end" type="datetime-local" value={endDt} onChange={(e) => setEndDt(e.target.value)} className={inputBase} />
            </div>
          </div>
          {mode === "edit" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current Stage</label>
                <div data-testid="deliverable-modal-stage-readonly" className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{stage}</div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Stage Status</label>
                <div data-testid="deliverable-modal-stage-status-readonly" className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{stageStatus}</div>
              </div>
              <p className="col-span-2 -mt-1 text-[11px] text-slate-400">Driven by the "Deliverable Closed" action in the Work Sheet — not editable here.</p>
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button data-testid="deliverable-modal-cancel" onClick={onClose} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Cancel</button>
          <button data-testid="deliverable-modal-submit" onClick={submit} disabled={submitting} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {submitting ? "Saving..." : (mode === "edit" ? "Save Changes" : "Add Deliverable")}
          </button>
        </div>
      </div>
    </div>
  );
};
