import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { approveDeliverable } from "@/services/api";
import { WORKSHEET } from "@/constants/testIds";

const NONE = "__none__";

export const CloseDeliverableModal = ({
  open,
  onClose,
  currentUserId,
  projects,
  deliverables,
  onClosed,
}) => {
  const [projectId, setProjectId] = useState("");
  const [deliverableId, setDeliverableId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inProgressDeliverables = deliverables.filter(
    (d) =>
      d.project_id === projectId &&
      !(
        d.current_stage === "Finish" &&
        d.stage_status === "Completed"
      )
  );

  const selected = deliverables.find(
    (d) => d.id === deliverableId
  );

  const reset = () => {
    setProjectId("");
    setDeliverableId("");
  };

  const handleClose = async () => {
    if (!selected) return;

    setSubmitting(true);

    try {
      await approveDeliverable(
        currentUserId,
        deliverableId
      );

      toast.success(
        `${selected.current_stage} stage closed for "${selected.name}"`
      );

      onClosed?.();
      reset();
      onClose();
    } catch (e) {
      toast.error(
        e.response?.data?.detail ||
          "Could not close stage"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent
        data-testid="close-deliverable-modal"
        className="overflow-hidden rounded-2xl border-border bg-card p-0 shadow-2xl sm:max-w-[520px]"
      >
        {/* Header */}
        <DialogHeader className="border-b border-border px-6 py-5">
          <DialogTitle className="text-base font-semibold text-foreground">
            Close Deliverable Stage
          </DialogTitle>

          <DialogDescription className="mt-1 text-xs leading-5 text-muted-foreground">
            Pick a project and an in-progress deliverable to
            mark its current stage as complete.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="bg-[#f7f9fc] px-6 py-5">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="space-y-4">
              {/* Project */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Project
                </label>

                <Select
                  value={projectId || NONE}
                  onValueChange={(v) => {
                    setProjectId(
                      v === NONE ? "" : v
                    );
                    setDeliverableId("");
                  }}
                >
                  <SelectTrigger
                    data-testid="close-deliverable-project-select"
                    className="h-10 rounded-lg border-input bg-card text-sm"
                  >
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value={NONE}>
                      —
                    </SelectItem>

                    {projects.map((p) => (
                      <SelectItem
                        key={p.id}
                        value={p.id}
                      >
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Deliverable */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Deliverable in progress
                </label>

                <Select
                  value={deliverableId || NONE}
                  onValueChange={(v) =>
                    setDeliverableId(
                      v === NONE ? "" : v
                    )
                  }
                  disabled={!projectId}
                >
                  <SelectTrigger
                    data-testid="close-deliverable-select"
                    className="h-10 rounded-lg border-input bg-card text-sm disabled:bg-muted"
                  >
                    <SelectValue
                      placeholder={
                        projectId
                          ? "Select deliverable"
                          : "Pick a project first"
                      }
                    />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value={NONE}>
                      —
                    </SelectItem>

                    {inProgressDeliverables.map(
                      (d) => (
                        <SelectItem
                          key={d.id}
                          value={d.id}
                        >
                          {d.name} — {d.current_stage} stage
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>

                {projectId &&
                  inProgressDeliverables.length ===
                    0 && (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      No deliverables in progress
                      for this project.
                    </p>
                  )}
              </div>

              {/* Selected stage preview */}
              {selected && (
                <div className="rounded-lg border border-[#dcdcf8] bg-[#f0f0fd] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#2b2bb5]">
                    Current stage
                  </p>

                  <p className="mt-0.5 text-sm font-medium text-[#1a1a8a]">
                    {selected.current_stage}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="border-t border-border bg-card px-6 py-4">
          <Button
            data-testid="close-deliverable-cancel-btn"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={submitting}
          >
            Cancel
          </Button>

          <Button
            data-testid={
              WORKSHEET.closeDeliverableBtn +
              "-confirm"
            }
            disabled={
              !deliverableId || submitting
            }
            onClick={handleClose}
            className="bg-[#2b2bb5] text-white hover:bg-[#1a1a8a]"
          >
            {submitting
              ? "Closing..."
              : "Close Stage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};