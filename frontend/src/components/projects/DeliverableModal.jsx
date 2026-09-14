import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Trash2, ChevronRight, FileText } from "lucide-react";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { DeliverableFields } from "@/components/projects/DeliverableFields";

import { createDeliverable, updateDeliverable, deleteDeliverable } from "@/services/api";
import { trackEvent } from "../../analytics";

const emptyDeliverable = {
  name: "",
  type: "",
  start_dt: "",
  end_dt: "",
  required_stages: ["Content"],
};

export const DeliverableModal = ({
  open,
  mode,
  projectId,
  initial,
  currentUserId,
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

  const toggleStage = (stage) => {
    setDeliverable((prev) => {
      const current = prev.required_stages || [];

      const next = current.includes(stage)
        ? current.filter((s) => s !== stage)
        : [...current, stage];

      return { ...prev, required_stages: next };
    });
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
        {/* Header: breadcrumb + close */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0f0fd] text-[#2b2bb5]">
              <FileText className="h-3.5 w-3.5" />
            </span>

            <span>Deliverable</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">
              {isEdit ? "Edit" : "New"}
            </span>
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
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <DeliverableFields
            deliverable={deliverable}
            onChange={updateField}
            onToggleStage={toggleStage}
            deliverableTypes={deliverableTypes}
            disabled={saving}
          />
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-white px-6 py-4">
          {isEdit ? (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={saving || deleting}
              aria-label="Delete deliverable"
              title="Delete deliverable"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-60"
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
                  ? "Save changes"
                  : "Add deliverable"}
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