import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";

import {
  createDeliverable,
  updateDeliverable,
  deleteDeliverable,
} from "@/services/api";

const emptyDeliverable = {
  name: "",
  type: "",
  owner_id: "",
  start_dt: "",
  end_dt: "",
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

  useEffect(() => {
    if (!open) return;

    if (mode === "edit" && initial) {
      setDeliverable({
        name: initial.name || "",
        type: initial.type || "",
        owner_id: initial.owner_id || "",
        start_dt: initial.start_dt || "",
        end_dt: initial.end_dt || "",
      });
    } else {
      setDeliverable({
        ...emptyDeliverable,
      });
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
        owner_id: deliverable.owner_id || null,
        start_dt: deliverable.start_dt || null,
        end_dt: deliverable.end_dt || null,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {isEdit
                ? "Edit Deliverable"
                : "Add Deliverable"}
            </h2>

            <p className="mt-0.5 text-sm text-muted-foreground">
              {isEdit
                ? "Update the deliverable details and schedule."
                : "Add a deliverable and schedule its timeline."}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="bg-[#f7f9fc] px-6 py-5">
          <div className="rounded-xl border border-border bg-white p-5">
            <div className="mb-5 flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f0f0fd] text-xs font-semibold text-[#1a1a8a]">
                1
              </span>

              <h3 className="text-sm font-semibold text-foreground">
                Deliverable Details
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Name */}
              <div className="md:col-span-2">
                <label className={labelBase}>
                  Task Name *
                </label>

                <input
                  type="text"
                  value={deliverable.name}
                  onChange={(e) =>
                    updateField(
                      "name",
                      e.target.value
                    )
                  }
                  placeholder="e.g. Diwali SIP Reel"
                  className={inputBase}
                  autoFocus
                  disabled={saving}
                />
              </div>

              {/* Type */}
              <div>
                <label className={labelBase}>
                  Type
                </label>

                <select
                  value={deliverable.type}
                  onChange={(e) =>
                    updateField(
                      "type",
                      e.target.value
                    )
                  }
                  className={inputBase}
                  disabled={saving}
                >
                  <option value="">—</option>

                  {deliverableTypes.map(
                    (type) => (
                      <option
                        key={type}
                        value={type}
                      >
                        {type}
                      </option>
                    )
                  )}
                </select>
              </div>

              {/* Owner */}
              <div>
                <label className={labelBase}>
                  Owner
                </label>

                <select
                  value={deliverable.owner_id}
                  onChange={(e) =>
                    updateField(
                      "owner_id",
                      e.target.value
                    )
                  }
                  className={inputBase}
                  disabled={saving}
                >
                  <option value="">
                    Unassigned
                  </option>

                  {users.map((user) => (
                    <option
                      key={user.id}
                      value={user.id}
                    >
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start */}
              <div>
                <label className={labelBase}>
                  Start · Date & Time
                </label>

                <input
                  type="datetime-local"
                  value={deliverable.start_dt}
                  onChange={(e) =>
                    updateField(
                      "start_dt",
                      e.target.value
                    )
                  }
                  className={inputBase}
                  disabled={saving}
                />
              </div>

              {/* End */}
              <div>
                <label className={labelBase}>
                  End · Date & Time
                </label>

                <input
                  type="datetime-local"
                  value={deliverable.end_dt}
                  onChange={(e) =>
                    updateField(
                      "end_dt",
                      e.target.value
                    )
                  }
                  className={inputBase}
                  disabled={saving}
                />
              </div>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-muted-foreground">
            Start and end date-time are used for the
            Content → Design → Animate → Finish stage
            timeline.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-white px-6 py-4">
          {isEdit && (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={saving || deleting}
              className="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete Deliverable
            </button>
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
              className="rounded-lg bg-[#2b2bb5] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30 disabled:cursor-not-allowed disabled:bg-[#f0f0fd] disabled:text-[#c8d5ee]"
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
        description={`"${deliverable.name || initial?.name || "This deliverable"}" will be permanently deleted.`}
        warning="Any historical work entries linked to this deliverable will be preserved."
        confirmLabel="Delete Deliverable"
        loading={deleting}
      />
    </div>
  );
};