import { useState } from "react";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Trash2, X, Link2 } from "lucide-react";

const STAGES = ["Content", "Design", "Animate", "Finish"];
const NONE = "__none__";

const BulkAssignPopover = ({ projects, deliverables, onApply, onClose }) => {
  const [projectId, setProjectId] = useState("");
  const [deliverableId, setDeliverableId] = useState("");
  const [stage, setStage] = useState("");
  const projDelivs = deliverables.filter((d) => d.project_id === projectId);

  const apply = () => {
    const patch = {};
    if (projectId) patch.project_id = projectId;
    if (deliverableId) patch.deliverable_id = deliverableId;
    if (stage) patch.stage = stage;
    if (Object.keys(patch).length === 0) return;
    onApply(patch);
    onClose();
  };

  return (
    <div data-testid="worksheet-bulk-assign-popover" className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-md">
      <Select value={projectId || NONE} onValueChange={(v) => { setProjectId(v === NONE ? "" : v); setDeliverableId(""); }}>
        <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Project" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={deliverableId || NONE} onValueChange={(v) => setDeliverableId(v === NONE ? "" : v)} disabled={!projectId}>
        <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Deliverable" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {projDelivs.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={stage || NONE} onValueChange={(v) => setStage(v === NONE ? "" : v)}>
        <SelectTrigger className="h-8 w-[110px]"><SelectValue placeholder="Stage" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button data-testid="worksheet-bulk-assign-apply-btn" size="sm" className="h-8 bg-indigo-600 hover:bg-indigo-700" onClick={apply}>Apply</Button>
      <Button size="sm" variant="ghost" className="h-8" onClick={onClose}>Cancel</Button>
    </div>
  );
};

export const BulkActionBar = ({ selectedCount, currentUser, options, projects = [], deliverables = [], onApplyStatus, onApplyAssign, onDelete, onClear }) => {
  const [status, setStatus] = useState("");
  const [showAssign, setShowAssign] = useState(false);
  const allowedStatuses = currentUser.role === "member" ? options.member_forward_statuses : options.statuses;

  return (
    <div className="border-b border-indigo-200 bg-indigo-50">
      <div data-testid="worksheet-bulk-action-bar" className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="text-sm font-medium text-indigo-800">{selectedCount} selected</span>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger data-testid="worksheet-bulk-status-select" className="h-8 w-[180px] bg-white">
            <SelectValue placeholder="Set status to..." />
          </SelectTrigger>
          <SelectContent>
            {allowedStatuses?.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button data-testid="worksheet-bulk-apply-btn" size="sm" className="h-8 bg-indigo-700 hover:bg-indigo-800" disabled={!status} onClick={() => onApplyStatus(status)}>
          Apply Status
        </Button>

        <Button data-testid="worksheet-bulk-assign-btn" size="sm" variant="outline" className="h-8" onClick={() => setShowAssign((v) => !v)}>
          <Link2 className="mr-1 h-3.5 w-3.5" /> Assign to Project…
        </Button>

        {currentUser.role === "admin" && (
          <Button data-testid="worksheet-bulk-delete-btn" size="sm" variant="ghost" className="h-8 text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={onDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete selected
          </Button>
        )}

        <Button data-testid="worksheet-bulk-clear-btn" size="sm" variant="ghost" className="ml-auto h-8" onClick={onClear}>
          <X className="mr-1 h-3.5 w-3.5" /> Clear selection
        </Button>
      </div>
      {showAssign && (
        <div className="border-t border-indigo-100 bg-white/60 px-4 py-2">
          <BulkAssignPopover projects={projects} deliverables={deliverables} onApply={onApplyAssign} onClose={() => setShowAssign(false)} />
        </div>
      )}
    </div>
  );
};
