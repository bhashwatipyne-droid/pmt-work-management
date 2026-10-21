import { DeliverableFields } from "@/components/projects/DeliverableFields";
import { PROJECTS } from "@/constants/testIds";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { STAGE_COLORS } from "@/constants/projectPalette";
import { format, parseISO } from "date-fns";

export function CreateProjectDeliverables(ctx) {
  const { closeDraftDeliverable, commitDraftDeliverable, deliverableTypes, deliverables, draftDeliverable, openAddDeliverable, openEditDeliverable, removeDeliverable, toggleDraftStage, updateDraftField } = ctx;
  return (
    <>
    {/* Deliverables */}
    <div className="rounded-xl border border-border bg-[#f7f9fc]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            Deliverables ({deliverables.length})
          </h3>

          <p className="mt-0.5 text-xs text-muted-foreground">
            Optional. Break the project into deliverables to track progress.
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
        <div className="flex flex-col items-center justify-center px-5 py-6 text-center">
          <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-muted-foreground">
            <Package className="h-4 w-4" />
          </span>

          <p className="text-sm font-semibold text-foreground">
            No deliverables added yet
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            You can also add them later from the project page.
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
    </>
  );
}
