import { APPROVALS } from "@/constants/testIds";
import { COLUMNS, deadlineText, dueChip } from "@/components/approvals/approvalsView";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

export function ApprovalsDetail(ctx) {
  const { aSel, canAct, decide, detailOpen, handleMove, loading, movingId, notes, setDetailOpen, setNotes } = ctx;
  return (
    <>
    {/* DETAIL */}
    <div className={`flex-1 overflow-y-auto ${detailOpen ? "" : "max-md:hidden"}`}>
      {aSel ? (
        <div className="max-w-[720px] px-4 pb-10 pt-4 md:px-7 md:pt-6">
          <button
            type="button"
            onClick={() => setDetailOpen(false)}
            className="mb-3 inline-flex h-10 items-center gap-1 rounded-lg pr-3 text-sm font-medium text-[#2b2bb5] active:bg-[#f0f0fd] md:hidden"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to list
          </button>

          <div className="flex flex-wrap items-start gap-4">
            <div className="flex min-w-0 flex-1 flex-col gap-2 md:min-w-[240px]">
              <div className="flex items-center gap-2">
                {(() => {
                  const chip = dueChip(aSel.due_date);
                  return (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium ${chip.cls}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${chip.dot}`} />
                      {chip.label}
                    </span>
                  );
                })()}
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {aSel.deliverable_name}
              </h2>
            </div>

            {canAct && (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <span className="text-xs text-slate-500">Move to</span>
              {COLUMNS.filter((c) => c.key !== aSel.approval_type).map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => handleMove(aSel, c.key)}
                  disabled={movingId === aSel.id}
                  className="h-7 rounded-lg bg-white px-2.5 text-xs text-slate-700 shadow-[inset_0_0_0_1px_rgba(226,232,240,1)] hover:bg-slate-50 disabled:opacity-50"
                >
                  {c.label}
                </button>
              ))}
            </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-[92px_1fr] gap-y-2.5 md:grid-cols-[130px_1fr] text-sm">
            <span className="text-slate-500">Project</span>
            <span className="text-foreground">{aSel.project_name}</span>
            <span className="text-slate-500">Client</span>
            <span className="text-foreground">{aSel.client_name || "—"}</span>
            <span className="text-slate-500">Deadline</span>
            <span className="text-foreground">{deadlineText(aSel.due_date)}</span>
            <span className="text-slate-500">Workflow</span>
            <span className="flex flex-wrap items-center gap-1.5">
              {(aSel.required_stages || [aSel.current_stage]).map((stage, i, arr) => (
                <span key={stage} className="flex items-center gap-1.5">
                  <span
                    className={[
                      "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium",
                      stage === aSel.current_stage
                        ? "bg-[#2b2bb5] text-white"
                        : arr.indexOf(aSel.current_stage) > i
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500",
                    ].join(" ")}
                  >
                    {stage}
                  </span>
                  {i < arr.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                </span>
              ))}
            </span>
          </div>

          {aSel.comments && (
            <div className="mt-5 rounded-lg border border-border bg-muted/50 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground">
              {aSel.comments}
            </div>
          )}

          {canAct ? (
          <>
          <label className="mt-5 flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">Review note</span>
            <textarea
              data-testid={`${APPROVALS.notePrefix}-${aSel.id}`}
              placeholder="Optional note"
              value={notes[aSel.id] || ""}
              onChange={(e) =>
                setNotes((prev) => ({ ...prev, [aSel.id]: e.target.value }))
              }
              rows={3}
              className="resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-5 outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              data-testid={`${APPROVALS.approvePrefix}-${aSel.id}`}
              onClick={() => decide(aSel)}
              disabled={movingId === aSel.id}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#2b2bb5] px-3.5 text-sm font-semibold text-white hover:bg-[#1a1a8a] disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Approve
            </button>
          </div>
          </>
          ) : (
            <div
              data-testid="approvals-read-only-note"
              className="mt-5 rounded-lg border border-border bg-muted/50 px-3.5 py-2.5 text-xs leading-5 text-muted-foreground"
            >
              You can follow this approval here. Only managers can approve it
              or move it to another queue.
            </div>
          )}
        </div>
      ) : (
        !loading && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Select an approval to review it
          </div>
        )
      )}
    </div>
    </>
  );
}
