import { Clock, X } from "lucide-react";

export function QuickLoggerHeader(ctx) {
  const { handleClose, saving } = ctx;
  return (
    <>
    {/* Header */}
    <div className="flex items-center gap-2.5 px-5 pt-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0f0fd] text-[#2b2bb5]">
        <Clock className="h-4 w-4" />
      </span>
      <h2 className="flex-1 text-base font-semibold text-foreground">Quick log</h2>
      <button
        type="button"
        onClick={handleClose}
        disabled={saving}
        aria-label="Close"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-slate-100 disabled:opacity-50"
      >
        <X className="h-[18px] w-[18px]" />
      </button>
    </div>
    </>
  );
}
