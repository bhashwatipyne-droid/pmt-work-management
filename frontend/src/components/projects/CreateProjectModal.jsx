import { useEffect, useState } from "react";
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

const inputBase =
  "w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const smallInputBase =
  "w-full min-w-0 rounded-md border border-input bg-white px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15";

const labelBase =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export const CreateProjectModal = ({
  open,
  onClose,
  onCreated,
  clients,
  users,
  deliverableTypes,
}) => {
  const { currentUserId } = useUser();

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState(clients[0]?.id || "");
  const [pocId, setPocId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("Planning");
  const [deliverables, setDeliverables] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (
      clients.length > 0 &&
      !clients.some((client) => client.id === clientId)
    ) {
      setClientId(clients[0].id);
    }
  }, [clients, clientId]);

  const selectedClient = clients.find(
    (client) => client.id === clientId
  );

  const availablePocs = selectedClient?.contact_persons || [];

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
    setDeliverables((prev) =>
      prev.map((d, idx) =>
        idx === i ? { ...d, [key]: value } : d
      )
    );
  };

  const removeDeliverable = (i) => {
    setDeliverables((prev) =>
      prev.filter((_, idx) => idx !== i)
    );
  };

  const reset = () => {
    setName("");
    setClientId(clients[0]?.id || "");
    setPocId("");
    setStartDate("");
    setEndDate("");
    setStatus("Planning");
    setDeliverables([]);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      return toast.error("Project name is required");
    }

    if (!clientId) {
      return toast.error("Please select a client");
    }

    if (!startDate || !endDate) {
      return toast.error("Start and end date are required");
    }

    if (endDate < startDate) {
      return toast.error("End date must be after start date");
    }

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
        poc_id: pocId || null,
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
      toast.error(
        err?.response?.data?.detail ||
          "Failed to create project"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        data-testid={PROJECTS.modal}
        className="flex h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-none flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Create Project
            </h2>

            <p className="mt-0.5 text-sm text-muted-foreground">
              Set the project details, then schedule its
              deliverables.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">
              {deliverables.length} deliverable
              {deliverables.length === 1 ? "" : "s"}
            </span>

            <button
              type="button"
              data-testid={PROJECTS.modalClose}
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f9fc] px-6 py-5">
          {/* Section 1 */}
          <div className="mb-5 rounded-xl border border-border bg-white p-5">
            <div className="mb-5 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f0f0fd] text-xs font-semibold text-[#1a1a8a]">
                1
              </span>

              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Project Details
                </h3>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  Basic information about the project.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <div className="md:col-span-2">
                <label className={labelBase}>
                  Project Name *
                </label>

                <input
                  data-testid={PROJECTS.fieldName}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Diwali SIP push"
                  className={inputBase}
                />
              </div>

              <div>
                <label className={labelBase}>
                  Client *
                </label>

                <select
                  data-testid={PROJECTS.fieldClient}
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setPocId("");
                  }}
                  className={inputBase}
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelBase}>
                  Start Date *
                </label>

                <input
                  data-testid={PROJECTS.fieldStart}
                  type="date"
                  value={startDate}
                  onChange={(e) =>
                    setStartDate(e.target.value)
                  }
                  className={inputBase}
                />
              </div>

              <div>
                <label className={labelBase}>
                  End Date *
                </label>

                <input
                  data-testid={PROJECTS.fieldEnd}
                  type="date"
                  value={endDate}
                  onChange={(e) =>
                    setEndDate(e.target.value)
                  }
                  className={inputBase}
                />
              </div>

              <div>
                <label className={labelBase}>POC</label>

                <select
                  value={pocId}
                  onChange={(e) => setPocId(e.target.value)}
                  className={inputBase}
                >
                  <option value="">No POC selected</option>

                  {availablePocs.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelBase}>Status</label>

                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputBase}
                >
                  {[
                    "Planning",
                    "Active",
                    "In Rework",
                    "Completed",
                  ].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div className="rounded-xl border border-border bg-white p-5">
            <div className="mb-4 flex items-start gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f0f0fd] text-xs font-semibold text-[#1a1a8a]">
                2
              </span>

              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Deliverables
                </h3>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  Start and end date-time are used for the
                  stage timeline.
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-border">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-[#f7f9fc] text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="w-10 px-3 py-2.5">
                        #
                      </th>

                      <th className="w-[30%] px-3 py-2.5">
                        Name *
                      </th>

                      <th className="px-3 py-2.5">
                        Type
                      </th>

                      <th className="px-3 py-2.5">
                        Owner
                      </th>

                      <th className="px-3 py-2.5">
                        Start · Date & Time
                      </th>

                      <th className="px-3 py-2.5">
                        End · Date & Time
                      </th>

                      <th className="w-10 px-2 py-2.5" />
                    </tr>
                  </thead>

                  <tbody>
                    {deliverables.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-3 py-10 text-center"
                        >
                          <div className="text-sm font-medium text-foreground">
                            No deliverables added yet
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            Add a deliverable to start
                            building the project timeline.
                          </div>
                        </td>
                      </tr>
                    ) : (
                      deliverables.map((d, i) => (
                        <tr
                          key={i}
                          data-testid={`${PROJECTS.deliverableRowPrefix}-${i}`}
                          className="border-t border-border"
                        >
                          <td className="px-3 py-2 text-xs text-muted-foreground">
                            {i + 1}
                          </td>

                          <td className="w-[30%] px-3 py-2">
                            <input
                              value={d.name}
                              onChange={(e) =>
                                updateDeliverable(
                                  i,
                                  "name",
                                  e.target.value
                                )
                              }
                              placeholder="Task name"
                              className={smallInputBase}
                            />
                          </td>

                          <td className="px-3 py-2">
                            <select
                              value={d.type}
                              onChange={(e) =>
                                updateDeliverable(
                                  i,
                                  "type",
                                  e.target.value
                                )
                              }
                              className={smallInputBase}
                            >
                              <option value="">—</option>

                              {deliverableTypes.map((t) => (
                                <option key={t} value={t}>
                                  {t}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="px-3 py-2">
                            <select
                              value={d.owner_id}
                              onChange={(e) =>
                                updateDeliverable(
                                  i,
                                  "owner_id",
                                  e.target.value
                                )
                              }
                              className={smallInputBase}
                            >
                              <option value="">
                                Unassigned
                              </option>

                              {users.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.name}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="px-3 py-2">
                            <input
                              type="datetime-local"
                              value={d.start_dt}
                              onChange={(e) =>
                                updateDeliverable(
                                  i,
                                  "start_dt",
                                  e.target.value
                                )
                              }
                              className={smallInputBase}
                            />
                          </td>

                          <td className="px-3 py-2">
                            <input
                              type="datetime-local"
                              value={d.end_dt}
                              onChange={(e) =>
                                updateDeliverable(
                                  i,
                                  "end_dt",
                                  e.target.value
                                )
                              }
                              className={smallInputBase}
                            />
                          </td>

                          <td className="px-2 py-2">
                            <button
                              type="button"
                              data-testid={`${PROJECTS.deliverableRemovePrefix}-${i}`}
                              onClick={() => removeDeliverable(i)}
                              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200"
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
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                data-testid={PROJECTS.addDeliverableBtn}
                onClick={addDeliverable}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#b8b8df] bg-[#f0f0fd] px-3 py-2 text-xs font-semibold text-[#1a1a8a] transition-colors hover:bg-[#dcdcf8] focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Deliverable
              </button>

              <span className="text-xs text-muted-foreground">
                Duplicates the last row's schedule, shifted
                by a day.
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-white px-6 py-4">
          <span className="text-xs text-muted-foreground">
            Deliverable schedules drive the Content → Design
            → Animate → Finish stages.
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid={PROJECTS.modalCancel}
              onClick={onClose}
              className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
            >
              Cancel
            </button>

            <button
              type="button"
              data-testid={PROJECTS.modalSubmit}
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-lg bg-[#2b2bb5] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30 disabled:cursor-not-allowed disabled:bg-[#f0f0fd] disabled:text-[#c8d5ee]"
            >
              {submitting ? "Creating..." : "Create Project"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};