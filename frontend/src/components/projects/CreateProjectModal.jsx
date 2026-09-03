import { useState } from "react";
import { toast } from "sonner";
import { X, Plus, Trash2 } from "lucide-react";
import { PROJECTS } from "@/constants/testIds";
import { createProject } from "@/services/api";
import { useUser } from "@/context/UserContext";

const emptyDeliverable = () => ({
  name: "",
  type: "",
  owner_id: "",
  start_dt: "",
  end_dt: "",
});

const inputBase = "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

export const CreateProjectModal = ({ open, onClose, onCreated, clients, users, deliverableTypes }) => {
  const { currentUserId } = useUser();
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("Planning");
  const [deliverables, setDeliverables] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const addDeliverable = () => {
    const last = deliverables[deliverables.length - 1];
    const next = emptyDeliverable();
    if (last?.start_dt) {
      const d = new Date(last.start_dt);
      d.setDate(d.getDate() + 1);
      next.start_dt = d.toISOString().slice(0, 16);
    }
    if (last?.end_dt) {
      const d = new Date(last.end_dt);
      d.setDate(d.getDate() + 1);
      next.end_dt = d.toISOString().slice(0, 16);
    }
    setDeliverables([...deliverables, next]);
  };

  const updateDeliverable = (i, key, value) => {
    setDeliverables((prev) => prev.map((d, idx) => (idx === i ? { ...d, [key]: value } : d)));
  };

  const removeDeliverable = (i) => {
    setDeliverables((prev) => prev.filter((_, idx) => idx !== i));
  };

  const reset = () => {
    setName("");
    setClientId(clients[0]?.id || "");
    setStartDate("");
    setEndDate("");
    setStatus("Planning");
    setDeliverables([]);
  };

  const handleSubmit = async () => {
    if (!name.trim()) return toast.error("Project name is required");
    if (!clientId) return toast.error("Please select a client");
    if (!startDate || !endDate) return toast.error("Start and end date are required");
    if (endDate < startDate) return toast.error("End date must be after start date");
    setSubmitting(true);
    try {
      const cleanedDeliverables = deliverables
        .filter((d) => d.name.trim())
        .map((d) => ({
          name: d.name.trim(),
          type: d.type || "",
          owner_id: d.owner_id || null,
          start_dt: d.start_dt || null,
          end_dt: d.end_dt || null,
        }));
      const created = await createProject(currentUserId, {
        name: name.trim(),
        client_id: clientId,
        start_date: startDate,
        end_date: endDate,
        status,
        deliverables: cleanedDeliverables,
      });
      toast.success(`Project "${created.name}" created`);
      reset();
      onCreated?.(created);
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create project");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        data-testid={PROJECTS.modal}
        className="my-10 w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Create Project</h2>
            <p className="text-sm text-slate-500">Set the Project details, then schedule its deliverables.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{deliverables.length} deliverable{deliverables.length === 1 ? "" : "s"}</span>
            <button
              data-testid={PROJECTS.modalClose}
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          {/* Section 1: Project Details */}
          <div className="mb-5 rounded-xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">1</span>
              <h3 className="text-sm font-semibold text-slate-900">Project Details</h3>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <div className="md:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Project Name *</label>
                <input
                  data-testid={PROJECTS.fieldName}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Diwali SIP push"
                  className={inputBase}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Client *</label>
                <select
                  data-testid={PROJECTS.fieldClient}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className={inputBase}
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Start Date *</label>
                <input
                  data-testid={PROJECTS.fieldStart}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={inputBase}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">End Date *</label>
                <input
                  data-testid={PROJECTS.fieldEnd}
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={inputBase}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                  POC
                </label>
                <input
                  type="text"
                  value={
                    clients.find((client) => client.id === clientId)?.contact_person || "—"
                  }
                  readOnly
                  className={inputBase}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputBase}
                >
                  {["Planning", "Active", "In Rework", "Completed"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Deliverables */}
          <div className="rounded-xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">2</span>
              <h3 className="text-sm font-semibold text-slate-900">Deliverables</h3>
              <p className="ml-3 text-xs text-slate-500">Start and end date-time are used for the stage timeline.</p>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-100">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="w-10 px-3 py-2">#</th>
                    <th className="px-3 py-2">Task Name *</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Owner</th>
                    <th className="px-3 py-2">Start · Date & Time</th>
                    <th className="px-3 py-2">End · Date & Time</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {deliverables.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-400">
                        No deliverables added yet.
                      </td>
                    </tr>
                  ) : (
                    deliverables.map((d, i) => (
                      <tr key={i} data-testid={`${PROJECTS.deliverableRowPrefix}-${i}`} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-xs text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2">
                          <input
                            value={d.name}
                            onChange={(e) => updateDeliverable(i, "name", e.target.value)}
                            placeholder="Task name"
                            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={d.type}
                            onChange={(e) => updateDeliverable(i, "type", e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                          >
                            <option value="">—</option>
                            {deliverableTypes.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={d.owner_id}
                            onChange={(e) => updateDeliverable(i, "owner_id", e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                          >
                            <option value="">Unassigned</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="datetime-local"
                            value={d.start_dt}
                            onChange={(e) => updateDeliverable(i, "start_dt", e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="datetime-local"
                            value={d.end_dt}
                            onChange={(e) => updateDeliverable(i, "end_dt", e.target.value)}
                            className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            data-testid={`${PROJECTS.deliverableRemovePrefix}-${i}`}
                            onClick={() => removeDeliverable(i)}
                            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center gap-4">
              <button
                data-testid={PROJECTS.addDeliverableBtn}
                onClick={addDeliverable}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-indigo-300 bg-indigo-50/40 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Deliverable
              </button>
              <span className="text-xs text-slate-500">Duplicates the last row's schedule, shifted by a day.</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4">
          <span className="text-xs text-slate-500">Deliverable schedules drive the Content → Design → Animate → Finish stages.</span>
          <div className="flex items-center gap-2">
            <button
              data-testid={PROJECTS.modalCancel}
              onClick={onClose}
              className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              data-testid={PROJECTS.modalSubmit}
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? "Creating..." : "Create Project"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};