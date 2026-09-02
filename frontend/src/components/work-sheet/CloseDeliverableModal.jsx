import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { approveDeliverable } from "@/services/api";
import { WORKSHEET } from "@/constants/testIds";

const NONE = "__none__";

export const CloseDeliverableModal = ({ open, onClose, currentUserId, projects, deliverables, onClosed }) => {
  const [projectId, setProjectId] = useState("");
  const [deliverableId, setDeliverableId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const inProgressDeliverables = deliverables.filter(
    (d) => d.project_id === projectId && !(d.current_stage === "Finish" && d.stage_status === "Completed")
  );
  const selected = deliverables.find((d) => d.id === deliverableId);

  const reset = () => {
    setProjectId("");
    setDeliverableId("");
  };

  const handleClose = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      await approveDeliverable(currentUserId, deliverableId);
      toast.success(`${selected.current_stage} stage closed for "${selected.name}"`);
      onClosed?.();
      reset();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not close stage");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent data-testid="close-deliverable-modal">
        <DialogHeader>
          <DialogTitle>Close Deliverable Stage</DialogTitle>
          <DialogDescription>Pick a project and an in-progress deliverable to mark its current stage as complete.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</label>
            <Select value={projectId || NONE} onValueChange={(v) => { setProjectId(v === NONE ? "" : v); setDeliverableId(""); }}>
              <SelectTrigger data-testid="close-deliverable-project-select"><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deliverable in progress</label>
            <Select value={deliverableId || NONE} onValueChange={(v) => setDeliverableId(v === NONE ? "" : v)} disabled={!projectId}>
              <SelectTrigger data-testid="close-deliverable-select"><SelectValue placeholder={projectId ? "Select deliverable" : "Pick a project first"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {inProgressDeliverables.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name} — {d.current_stage} stage</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projectId && inProgressDeliverables.length === 0 && (
              <p className="mt-1 text-xs text-muted-foreground">No deliverables in progress for this project.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button data-testid="close-deliverable-cancel-btn" variant="ghost" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            data-testid={WORKSHEET.closeDeliverableBtn + "-confirm"}
            disabled={!deliverableId || submitting}
            onClick={handleClose}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? "Closing..." : "Close Stage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
