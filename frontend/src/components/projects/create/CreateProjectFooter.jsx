import { PROJECTS } from "@/constants/testIds";

export function CreateProjectFooter(ctx) {
  const { canCreate, createLabel, handleClose, handleSubmit, submitting } = ctx;
  return (
    <>
    {/* Footer */}
    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-slate-50 px-6 py-3.5">
      <button
        type="button"
        data-testid={PROJECTS.modalCancel}
        onClick={handleClose}
        className="h-[34px] rounded-md border border-border bg-white px-3.5 text-[13px] font-semibold text-foreground hover:bg-slate-50"
      >
        Cancel
      </button>

      <button
        type="button"
        data-testid={PROJECTS.modalSubmit}
        onClick={handleSubmit}
        aria-disabled={!canCreate}
        disabled={submitting}
        className={`h-[34px] rounded-md px-4 text-[13px] font-semibold transition-colors ${
          canCreate
            ? "bg-[#2b2bb5] text-white hover:bg-[#1a1a8a]"
            : "cursor-not-allowed bg-slate-200 text-slate-400"
        }`}
      >
        {createLabel}
      </button>
    </div>
    </>
  );
}
