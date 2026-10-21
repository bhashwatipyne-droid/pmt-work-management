import { APPROVALS } from "@/constants/testIds";
import { Check, X } from "lucide-react";
import { KBD_CLASS, MOD_LABEL } from "@/components/approvals/approvalsView";

export function ApprovalsHeader(ctx) {
  const { bulkLoading, canAct, clearSelection, handleBulkApprove, selectedIds } = ctx;
  return (
    <>
    {/* HEADER */}
    <div className="flex items-center gap-3 px-3 pt-4 md:px-5 md:pt-5">
      <h1 className="flex-1 text-2xl font-semibold tracking-tight text-foreground">Approvals</h1>

      {canAct && selectedIds.size > 0 ? (
        // Gmail-style contextual bar — replaces the hint row the moment
        // anything is checked.
        <div className="flex items-center gap-2 rounded-lg bg-[#f0f0fd] px-3 py-1.5">
          <span className="text-xs font-semibold text-[#2b2bb5]">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            data-testid={APPROVALS.bulkApproveBtn}
            onClick={handleBulkApprove}
            disabled={bulkLoading}
            className="inline-flex h-7 items-center gap-1 rounded-md bg-[#2b2bb5] px-2.5 text-xs font-semibold text-white hover:bg-[#1a1a8a] disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" />
            Approve
          </button>
          <button
            type="button"
            aria-label="Clear selection"
            onClick={clearSelection}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[#2b2bb5] hover:bg-[#e4e4fb]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="hidden items-center gap-2.5 text-xs text-muted-foreground md:flex">
          {!canAct && (
            <span
              data-testid="approvals-view-only"
              title="Only managers and admins can approve or send items back"
              className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
            >
              View only
            </span>
          )}
          <span className="flex items-center gap-1">
            <kbd className={KBD_CLASS}>{MOD_LABEL}+J</kbd>
            <kbd className={KBD_CLASS}>{MOD_LABEL}+K</kbd>
            move
          </span>
          {canAct && (
            <>
              <span className="flex items-center gap-1">
                <kbd className={KBD_CLASS}>{MOD_LABEL}+A</kbd>
                approve
              </span>
            </>
          )}
        </div>
      )}
    </div>
    </>
  );
}
