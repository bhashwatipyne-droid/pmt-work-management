import { useState } from "react";
import { Button } from "../ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";
import {
  Trash2,
  X,
  Link2,
  EyeOff,
  ArrowUpToLine,
  ArrowDownToLine,
  Copy,
  ChevronDown,
} from "lucide-react";

const STAGES = ["Content", "Design", "Animate"];
const NONE = "__none__";

// Unchanged from before — same fields, same Apply/Cancel flow. Only its
// container (below) moved from an inline strip under the bar to a
// popover anchored above the new floating pill.
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
    <div data-testid="worksheet-bulk-assign-popover" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg">
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
      <Button data-testid="worksheet-bulk-assign-apply-btn" size="sm" onClick={apply}>Apply</Button>
      <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
    </div>
  );
};

// Small helper for the pill's icon+label buttons so every action stays
// visually identical without repeating the same className five times.
const BarButton = ({ icon: Icon, label, onClick, danger, ...rest }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-white/90 transition-colors hover:bg-white/10 ${
      danger ? "hover:bg-red-500/20 hover:text-red-300" : ""
    }`}
    {...rest}
  >
    <Icon className="h-3.5 w-3.5" />
    {label}
  </button>
);

export const BulkActionBar = ({
  selectedCount,
  currentUser,
  options,
  projects = [],
  deliverables = [],
  onApplyStatus,
  onApplyAssign,
  onHideRows,
  onInsertAbove,
  onInsertBelow,
  // New — the mock's bulk bar includes a Duplicate action, which didn't
  // exist as a bulk operation before (only per-row, from the row menu).
  // Optional: omit this prop and the button simply doesn't render.
  onDuplicate,
  onDelete,
  onClear,
}) => {
  const [showAssign, setShowAssign] = useState(false);
  const allowedStatuses = options.statuses;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
      <div className="relative flex flex-col items-center gap-2">
        {showAssign && (
          <div className="pointer-events-auto">
            <BulkAssignPopover
              projects={projects}
              deliverables={deliverables}
              onApply={onApplyAssign}
              onClose={() => setShowAssign(false)}
            />
          </div>
        )}

        <div
          data-testid="worksheet-bulk-action-bar"
          className="pointer-events-auto flex flex-wrap items-center gap-0.5 rounded-full bg-slate-900 py-1.5 pl-1 pr-1.5 text-white shadow-xl"
        >
          <span className="mr-1 whitespace-nowrap rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
            {selectedCount} row{selectedCount === 1 ? "" : "s"} selected
          </span>

          <div className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />

          {onInsertAbove && (
            <BarButton icon={ArrowUpToLine} label="Insert above" onClick={onInsertAbove} />
          )}
          {onInsertBelow && (
            <BarButton icon={ArrowDownToLine} label="Insert below" onClick={onInsertBelow} />
          )}
          {onDuplicate && (
            <BarButton icon={Copy} label="Duplicate" onClick={onDuplicate} />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-testid="worksheet-bulk-status-select"
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10"
              >
                Apply status
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {allowedStatuses?.map((s) => (
                <DropdownMenuItem
                  key={s}
                  data-testid="worksheet-bulk-apply-btn"
                  onClick={() => onApplyStatus(s)}
                >
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <BarButton
            icon={Link2}
            label="Assign to project"
            data-testid="worksheet-bulk-assign-btn"
            onClick={() => setShowAssign((v) => !v)}
          />

          <BarButton icon={EyeOff} label="Hide" onClick={onHideRows} />
          <BarButton icon={Trash2} label="Delete" danger onClick={onDelete} />

          <div className="mx-0.5 h-5 w-px shrink-0 bg-white/15" />

          <button
            type="button"
            data-testid="worksheet-bulk-clear-btn"
            onClick={onClear}
            aria-label="Clear selection"
            title="Clear selection"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};