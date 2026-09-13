import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  X,
  Plus,
  Trash2,
  ChevronRight,
  Briefcase,
  Package,
  CircleDot,
  User,
  Building2,
  CalendarDays,
} from "lucide-react";

import { PROJECTS } from "@/constants/testIds";
import { PROJECT_STATUSES, STAGES, STATUS_COLORS } from "@/constants/projectPalette";
import { createProject } from "@/services/api";
import { useUser } from "@/context/UserContext";
import { trackEvent } from "../../analytics";
import { SelectPill } from "@/components/ui/SelectPill";
import { DatePill } from "@/components/ui/DatePill";

const emptyDeliverable = () => ({
  name: "",
  type: "",
  start_dt: "",
  end_dt: "",
  required_stages: ["Content"],
  approval_types: [],
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
  const [status, setStatus] = useState(PROJECT_STATUSES[0]);
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
    setStatus(PROJECT_STATUSES[0]);
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
          start_dt: d.start_dt || null,
          end_dt: d.end_dt || null,
          required_stages:
            d.required_stages?.length
              ? d.required_stages
              : ["Content"],
          approval_types:
            d.approval_types || [],
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

      trackEvent("project_created", {
        project_id: created.id,
        status: created.status,
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
        className="flex h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: breadcrumb + close */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0f0fd] text-[#2b2bb5]">
              <Briefcase className="h-3.5 w-3.5" />
            </span>

            <span>Projects</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">
              New project
            </span>
          </div>

          <button
            type="button"
            data-testid={PROJECTS.modalClose}
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          {/* Icon + large inline title */}
          <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f0f0fd] text-[#2b2bb5]">
            <Package className="h-5 w-5" />
          </span>

          <input
            data-testid={PROJECTS.fieldName}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            autoFocus
            className="w-full border-none bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/60"
          />

          {/* Pill row: Status / POC / Client / Start date / End date */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <SelectPill
              icon={CircleDot}
              value={status}
              onChange={setStatus}
              options={PROJECT_STATUSES.map((s) => ({
                value: s,
                label: s,
                dotClassName: STATUS_COLORS[s]?.dot,
              }))}
            />

            <SelectPill
              icon={User}
              value={pocId}
              onChange={setPocId}
              placeholder="No POC"
              options={[
                { value: "", label: "No POC" },
                ...availablePocs.map((contact) => ({
                  value: contact.id,
                  label: contact.name,
                })),
              ]}
            />

            <SelectPill
              icon={Building2}
              value={clientId}
              onChange={(next) => {
                setClientId(next);
                setPocId("");
              }}
              triggerTestId={PROJECTS.fieldClient}
              options={clients.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />

            <DatePill
              icon={CalendarDays}
              value={startDate}
              onChange={setStartDate}
              placeholder="Start date"
              triggerTestId={PROJECTS.fieldStart}
            />

            <DatePill
              icon={CalendarDays}
              value={endDate}
              onChange={setEndDate}
              placeholder="End date"
              triggerTestId={PROJECTS.fieldEnd}
            />
          </div>

          <div className="my-6 border-t border-border" />

          {/* Deliverables */}
          <div className="rounded-xl border border-border bg-[#f7f9fc]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Deliverables ({deliverables.length})
                </h3>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  Break the project into deliverables to track progress.
                </p>
              </div>

              <button
                type="button"
                data-testid={PROJECTS.addDeliverableBtn}
                onClick={addDeliverable}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
              >
                <Plus className="h-3.5 w-3.5" />
                Add deliverable
              </button>
            </div>

            {deliverables.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
                <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-muted-foreground">
                  <Package className="h-4.5 w-4.5" />
                </span>

                <p className="text-sm font-semibold text-foreground">
                  No deliverables added yet
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Add deliverables to define key stages of this project.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-b-xl bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-xs">
                    <thead className="bg-[#f7f9fc] text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="w-10 px-3 py-2.5">#</th>
                        <th className="w-[30%] px-3 py-2.5">Name *</th>
                        <th className="px-3 py-2.5">Type</th>
                        <th className="px-3 py-2.5">Stages</th>
                        <th className="px-3 py-2.5">Start · Date & Time</th>
                        <th className="px-3 py-2.5">End · Date & Time</th>
                        <th className="w-10 px-2 py-2.5" />
                      </tr>
                    </thead>

                    <tbody>
                      {deliverables.map((d, i) => (
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
                                updateDeliverable(i, "name", e.target.value)
                              }
                              placeholder="Task name"
                              className={smallInputBase}
                            />
                          </td>

                          <td className="px-3 py-2">
                            <select
                              value={d.type}
                              onChange={(e) =>
                                updateDeliverable(i, "type", e.target.value)
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
                            <div className="flex flex-wrap gap-1">
                              {STAGES.map((stage) => {
                                const checked =
                                  d.required_stages?.includes(stage);

                                return (
                                  <label
                                    key={stage}
                                    className={`flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium transition-colors ${
                                      checked
                                        ? "border-[#2b2bb5] bg-[#f0f0fd] text-[#1a1a8a]"
                                        : "border-border bg-white text-muted-foreground hover:bg-slate-50"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={Boolean(checked)}
                                      onChange={() => {
                                        const current =
                                          d.required_stages || [];

                                        const next = checked
                                          ? current.filter((s) => s !== stage)
                                          : [...current, stage];

                                        updateDeliverable(
                                          i,
                                          "required_stages",
                                          next
                                        );
                                      }}
                                      className="h-3 w-3"
                                    />
                                    {stage}
                                  </label>
                                );
                              })}
                            </div>
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
                                updateDeliverable(i, "end_dt", e.target.value)
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-white px-6 py-4">
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
            className="rounded-lg bg-[#2b2bb5] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30 disabled:cursor-not-allowed disabled:bg-[#f0f0fd] disabled:text-[#c8d5ee]"
          >
            {submitting ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
};