import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Trash2, CalendarDays } from "lucide-react";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";

import { createDeliverable, updateDeliverable, deleteDeliverable } from "@/services/api";
import { trackEvent } from "../../analytics";
import { STAGES } from "@/constants/projectPalette";

const emptyDeliverable = {
  name: "",
  type: "",
  start_dt: "",
  end_dt: "",
  required_stages: ["Content"],
};

const inputBase =
  "w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const labelBase =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export const DeliverableModal = ({
  open,
  mode,
  projectId,
  initial,
  currentUserId,
  users = [],
  deliverableTypes = [],
  onClose,
  onSaved,
}) => {
  const [deliverable, setDeliverable] =
    useState(emptyDeliverable);

  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [approvalTypes, setApprovalTypes] = useState([]);

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && initial) {
      setDeliverable({
        name: initial.name || "",
        type: initial.type || "",
        start_dt: initial.start_dt || "",
        end_dt: initial.end_dt || "",
        required_stages:
          initial.required_stages?.length
            ? initial.required_stages
            : [initial.current_stage || "Content"],
      });
      setApprovalTypes(initial.approval_types || []);
    } else {
      setDeliverable({
        ...emptyDeliverable,
      });
      setApprovalTypes([]);
    }
  }, [open, mode, initial]);

  if (!open) return null;

  const updateField = (field, value) => {
    setDeliverable((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async () => {
    if (!deliverable.name.trim()) {
      return toast.error(
        "Deliverable name is required"
      );
    }

    if (!deliverable.required_stages?.length) {
      return toast.error(
        "Select at least one production stage"
      );
    }

    if (
      deliverable.start_dt &&
      deliverable.end_dt &&
      deliverable.end_dt <
        deliverable.start_dt
    ) {
      return toast.error(
        "End date-time must be after start date-time"
      );
    }

    setSaving(true);

    try {
      const payload = {
        name: deliverable.name.trim(),
        type: deliverable.type || "",
        start_dt: deliverable.start_dt || null,
        end_dt: deliverable.end_dt || null,
        required_stages:
          deliverable.required_stages || [],
        approval_types: approvalTypes,
      };

      let saved;

      if (mode === "edit" && initial?.id) {
        saved = await updateDeliverable(
          currentUserId,
          initial.id,
          payload
        );

        toast.success("Deliverable updated");
      } else {
        saved = await createDeliverable(
          currentUserId,
          {
            project_id: projectId,
            ...payload,
          }
        );

        toast.success("Deliverable added");
      }

      trackEvent(
        mode === "edit"
          ? "project_deliverable_edited"
          : "project_deliverable_created",
        {
          project_id: projectId,
          deliverable_id: saved.id,
          stage: saved.current_stage,
        }
      );

      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          `Failed to ${
            mode === "edit"
              ? "update"
              : "add"
          } deliverable`
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initial?.id) return;

    setDeleting(true);

    try {
      await deleteDeliverable(currentUserId, initial.id);

      trackEvent("project_deliverable_deleted", {
        project_id: projectId,
        deliverable_id: initial.id,
      });

      toast.success("Deliverable deleted");
      onSaved?.({ deleted: true, id: initial.id });
      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          "Could not delete deliverable"
      );
    } finally {
      setDeleting(false);
    }
  };

  const isEdit = mode === "edit";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-6 py-5">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {isEdit ? "Deliverable" : "New deliverable"}
            </p>

            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {isEdit ? "Edit Deliverable" : "Add Deliverable"}
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              {isEdit
                ? "Update the details and timeline for this deliverable."
                : "Define what needs to be created and which teams are involved."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close modal"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-[#f8fafc] px-6 py-6">
          <div className="space-y-5">
            {/* Basic details */}
            <section className="rounded-xl border border-border bg-white p-5">
              <div className="mb-5">
                <h3 className="text-base font-semibold text-foreground">
                  Deliverable details
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Give this deliverable a clear name and content type.
                </p>
              </div>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label className={labelBase}>
                    Deliverable name *
                  </label>

                  <input
                    type="text"
                    value={deliverable.name}
                    onChange={(e) =>
                      updateField("name", e.target.value)
                    }
                    placeholder="e.g. Diwali SIP Reel"
                    className={`${inputBase} h-12 text-base`}
                    autoFocus
                    disabled={saving}
                  />
                </div>

                {/* Type */}
                <div>
                  <label className={labelBase}>
                    Content type
                  </label>

                  <select
                    value={deliverable.type}
                    onChange={(e) =>
                      updateField("type", e.target.value)
                    }
                    className={`${inputBase} h-11`}
                    disabled={saving}
                  >
                    <option value="">Select content type</option>

                    {deliverableTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </section>

            {/* Production stages */}
            <section className="rounded-xl border border-border bg-white p-5">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-foreground">
                  Production stages
                </h3>

                <p className="mt-1 text-sm text-muted-foreground">
                  Select the teams required to complete this deliverable.
                  The stages will follow the order shown below.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {STAGES.map((stage, index) => {
                  const checked =
                    deliverable.required_stages?.includes(stage);

                  return (
                    <label
                      key={stage}
                      className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-all ${
                        checked
                          ? "border-[#2b2bb5] bg-[#f0f0fd] text-[#1a1a8a] ring-1 ring-[#2b2bb5]/20"
                          : "border-border bg-white text-muted-foreground hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setDeliverable((prev) => {
                            const current =
                              prev.required_stages || [];

                            const next = checked
                              ? current.filter((s) => s !== stage)
                              : [...current, stage];

                            return {
                              ...prev,
                              required_stages: next,
                            };
                          });
                        }}
                        disabled={saving}
                        className="h-4 w-4 accent-[#2b2bb5]"
                      />

                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {stage}
                        </p>

                        <p className="mt-0.5 text-xs opacity-70">
                          Stage {index + 1}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>

              {deliverable.required_stages?.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    Selected:
                  </span>

                  {STAGES.filter((stage) =>
                    deliverable.required_stages?.includes(stage)
                  ).map((stage, index, selectedStages) => (
                    <span key={stage}>
                      {stage}
                      {index < selectedStages.length - 1 && " → "}
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* Timeline */}
            <section className="rounded-xl border border-border bg-white p-5">
              <div className="mb-4 flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f0f0fd] text-[#2b2bb5]">
                  <CalendarDays className="h-4 w-4" />
                </div>

                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Timeline
                  </h3>

                  <p className="mt-1 text-sm text-muted-foreground">
                    Set the working window for this deliverable.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Start */}
                <div>
                  <label className={labelBase}>
                    Start date and time
                  </label>

                  <input
                    type="datetime-local"
                    value={deliverable.start_dt}
                    onChange={(e) =>
                      updateField("start_dt", e.target.value)
                    }
                    className={`${inputBase} h-11`}
                    disabled={saving}
                  />
                </div>

                {/* End */}
                <div>
                  <label className={labelBase}>
                    Target date and time
                  </label>

                  <input
                    type="datetime-local"
                    value={deliverable.end_dt}
                    onChange={(e) =>
                      updateField("end_dt", e.target.value)
                    }
                    className={`${inputBase} h-11`}
                    disabled={saving}
                  />
                </div>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                The target date is used to plan the selected production stages.
              </p>
            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-white px-6 py-4">
          {isEdit ? (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={saving || deleting}
              aria-label="Delete deliverable"
              title="Delete deliverable"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : (
            <div />
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20 disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg bg-[#2b2bb5] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? isEdit
                  ? "Saving..."
                  : "Adding..."
                : isEdit
                  ? "Save Changes"
                  : "Add Deliverable"}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDeleteModal
        open={deleteOpen}
        onClose={() => {
          if (!deleting) {
            setDeleteOpen(false);
          }
        }}
        onConfirm={handleDelete}
        title="Delete this deliverable?"
        description={`"${
          deliverable.name || initial?.name || "This deliverable"
        }" will be permanently deleted.`}
        warning="Any historical work entries linked to this deliverable will be preserved."
        confirmLabel="Delete Deliverable"
        loading={deleting}
      />
    </div>
  );
};