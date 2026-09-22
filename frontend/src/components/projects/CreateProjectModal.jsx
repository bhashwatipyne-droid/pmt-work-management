import { useEffect, useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  X,
  Plus,
  Trash2,
  Pencil,
  ChevronRight,
  Briefcase,
  Package,
  CircleDot,
  User,
  Building2,
  CalendarDays,
} from "lucide-react";

import { PROJECTS } from "@/constants/testIds";
import {
  PROJECT_STATUSES,
  STATUS_COLORS,
  STAGE_COLORS,
} from "@/constants/projectPalette";
import { createProject } from "@/services/api";
import { useUser } from "@/context/UserContext";
import { trackEvent } from "../../analytics";
import { SelectPill } from "@/components/ui/SelectPill";
import { DatePill } from "@/components/ui/DatePill";
import {
  DeliverableFields,
  validateStageSchedule,
} from "@/components/projects/DeliverableFields";

const emptyDraftDeliverable = () => ({
  id: null,
  name: "",
  type: "",
  stage_schedule: {},
  required_stages: ["Content"],
  approval_types: [],
});

export const CreateProjectModal = ({
  open,
  onClose,
  onCreated,
  clients,
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
  const [draftDeliverable, setDraftDeliverable] = useState(null);
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

  const openAddDeliverable = () => {
    setDraftDeliverable(emptyDraftDeliverable());
  };

  const openEditDeliverable = (d) => {
    setDraftDeliverable({ ...d });
  };

  const closeDraftDeliverable = () => {
    setDraftDeliverable(null);
  };

  const updateDraftField = (field, value) => {
    setDraftDeliverable((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDraftStage = (stage) => {
    setDraftDeliverable((prev) => {
      const current = prev.required_stages || [];

      const next = current.includes(stage)
        ? current.filter((s) => s !== stage)
        : [...current, stage];

      return { ...prev, required_stages: next };
    });
  };

  const commitDraftDeliverable = () => {
    if (!draftDeliverable.name.trim()) {
      return toast.error("Deliverable name is required");
    }

    if (!draftDeliverable.required_stages?.length) {
      return toast.error("Select at least one production stage");
    }

    const scheduleError = validateStageSchedule(
      draftDeliverable.required_stages,
      draftDeliverable.stage_schedule
    );
    if (scheduleError) {
      return toast.error(scheduleError);
    }

    const saved = {
      ...draftDeliverable,
      id: draftDeliverable.id || crypto.randomUUID(),
      name: draftDeliverable.name.trim(),
    };

    setDeliverables((prev) => {
      const exists = prev.some((d) => d.id === saved.id);

      return exists
        ? prev.map((d) => (d.id === saved.id ? saved : d))
        : [...prev, saved];
    });

    setDraftDeliverable(null);
  };

  const removeDeliverable = (id) => {
    setDeliverables((prev) => prev.filter((d) => d.id !== id));
  };

  const reset = () => {
    setName("");
    setClientId(clients[0]?.id || "");
    setPocId("");
    setStartDate("");
    setEndDate("");
    setStatus(PROJECT_STATUSES[0]);
    setDeliverables([]);
    setDraftDeliverable(null);
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
        .filter((d) => d.name?.trim())
        .map(({ id, ...d }) => ({
          name: d.name.trim(),
          type: d.type || "",
          stage_schedule: d.stage_schedule || {},
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
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 sm:p-6"
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

              {!draftDeliverable && (
                <button
                  type="button"
                  data-testid={PROJECTS.addDeliverableBtn}
                  onClick={openAddDeliverable}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add deliverable
                </button>
              )}
            </div>

            {/* Inline create/edit card — no modal-over-modal */}
            {draftDeliverable && (
              <div className="border-b border-border bg-white p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {draftDeliverable.id ? "Edit deliverable" : "Create deliverable"}
                </p>

                <DeliverableFields
                  deliverable={draftDeliverable}
                  onChange={updateDraftField}
                  onToggleStage={toggleDraftStage}
                  deliverableTypes={deliverableTypes}
                  autoFocusName
                  compact
                />

                <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={closeDraftDeliverable}
                    className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={commitDraftDeliverable}
                    className="rounded-lg bg-[#2b2bb5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30"
                  >
                    {draftDeliverable.id ? "Save changes" : "Add deliverable"}
                  </button>
                </div>
              </div>
            )}

            {deliverables.length === 0 && !draftDeliverable ? (
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
              deliverables.length > 0 && (
                <div className="divide-y divide-border rounded-b-xl bg-white">
                  {deliverables.map((d) => (
                    <div
                      key={d.id}
                      data-testid={`${PROJECTS.deliverableRowPrefix}-${d.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {d.name}
                          </span>

                          {d.type && (
                            <span className="text-xs text-muted-foreground">
                              · {d.type}
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {(d.required_stages || []).map((stage) => (
                              <span
                                key={stage}
                                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    STAGE_COLORS[stage]?.dot || "bg-slate-400"
                                  }`}
                                />
                                {stage}
                              </span>
                            ))}
                          </div>

                          {(() => {
                            const dates = Object.values(d.stage_schedule || {});
                            if (!dates.length) return null;
                            const start = dates
                              .map((w) => w.start_dt)
                              .filter(Boolean)
                              .sort()[0];
                            const end = dates
                              .map((w) => w.end_dt)
                              .filter(Boolean)
                              .sort()
                              .slice(-1)[0];
                            if (!start && !end) return null;
                            return (
                              <span className="text-[11px] text-muted-foreground">
                                {start ? format(parseISO(start), "dd MMM yyyy") : "—"}
                                {" – "}
                                {end ? format(parseISO(end), "dd MMM yyyy") : "—"}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDeliverable(d)}
                          aria-label={`Edit ${d.name}`}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          data-testid={`${PROJECTS.deliverableRemovePrefix}-${d.id}`}
                          onClick={() => removeDeliverable(d.id)}
                          aria-label={`Remove ${d.name}`}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
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