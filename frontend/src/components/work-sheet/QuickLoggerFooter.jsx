import { formatDuration } from "./quickLoggerLogic";

export function QuickLoggerFooter(ctx) {
  const { draft, handleClose, handleSave, savedEntries, saving, totalMinutes } = ctx;
  return (
    <>
    {/* Footer */}
    <div className="flex items-center gap-2 px-5 py-3 shadow-[inset_0_1px_0_rgb(234,238,244)]">
      <span className="flex-1 text-xs text-muted-foreground">
        {savedEntries.length === 0
          ? "No entries yet"
          : `${savedEntries.length} ${savedEntries.length === 1 ? "entry" : "entries"} · ${formatDuration(totalMinutes)}`}
        <span className="hidden sm:inline">
          {" · "}↓/↑ navigate · Enter select/log · Cmd/Ctrl + Enter save
        </span>
      </span>
      <button
        type="button"
        onClick={handleClose}
        disabled={saving}
        className="h-9 rounded-lg px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || (!savedEntries.length && !draft.text.trim())}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1a1a8a] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "Saving..." : savedEntries.length ? `Save ${savedEntries.length}` : "Save"}
      </button>
    </div>
    </>
  );
}
