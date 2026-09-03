import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import {
  createDeliverable,
  updateDeliverable,
} from "@/services/api";

const emptyDeliverable = {
  name: "",
  type: "",
  owner_id: "",
  start_dt: "",
  end_dt: "",
};

const inputBase =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

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
  const [deliverable, setDeliverable] = useState(emptyDeliverable);
  const [saving, setSaving] = useState(false);

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
      return toast.error("Deliverable name is required");
    }

    if (
      deliverable.start_dt &&
      deliverable.end_dt &&
      deliverable.end_dt < deliverable.start_dt
    ) {
      return toast.error("End date-time must be after start date-time");
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
        saved = await updateDeliverable(currentUserId, initial.id, payload);
        toast.success("Deliverable updated");
      } else {
        saved = await createDeliverable(currentUserId, {
          project_id: projectId,
          ...payload,
        });
        toast.success("Deliverable added");
      }

      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          `Failed to ${mode === "edit" ? "update" : "add"} deliverable`
      );
    } finally {
      setSaving(false);
    }
  };

  const isEdit = mode === "edit";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {isEdit ? "Edit Deliverable" : "Add Deliverable"}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {isEdit
                ? "Update the deliverable details and schedule."
                : "Add a deliverable and schedule its timeline."}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5">
          <div className="rounded-xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                1
              </span>

              <h3 className="text-sm font-semibold text-slate-900">
                Deliverable Details
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Name */}
              <div className="md:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Task Name *
                </label>

                <input
                  type="text"
                  value={deliverable.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="e.g. Diwali SIP Reel"
                  className={inputBase}
                  autoFocus
                />
              </div>

              {/* Type */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Type
                </label>

                <select
                  value={deliverable.type}
                  onChange={(e) => updateField("type", e.target.value)}
                  className={inputBase}
                >
                  <option value="">—</option>

                  {deliverableTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              {/* Owner */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Owner
                </label>

                <select
                  value={deliverable.owner_id}
                  onChange={(e) => updateField("owner_id", e.target.value)}
                  className={inputBase}
                >
                  <option value="">Unassigned</option>

                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Start · Date & Time
                </label>

                <input
                  type="datetime-local"
                  value={deliverable.start_dt}
                  onChange={(e) => updateField("start_dt", e.target.value)}
                  className={inputBase}
                />
              </div>

              {/* End */}
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  End · Date & Time
                </label>

                <input
                  type="datetime-local"
                  value={deliverable.end_dt}
                  onChange={(e) => updateField("end_dt", e.target.value)}
                  className={inputBase}
                />
              </div>
            </div>
          </div>

          <p className="mt-3 text-[11px] text-slate-400">
            Start and end date-time are used for the Content → Design → Animate
            → Finish stage timeline.
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
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
  );
};
