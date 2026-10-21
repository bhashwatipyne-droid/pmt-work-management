import { NOT_AVAILABLE_LABEL } from "@/lib/deliverableRules";
import { Trash2 } from "lucide-react";
import { formatDuration } from "./quickLoggerLogic";

export function QuickLoggerEntries(ctx) {
  const { clientMap, projectMap, savedEntries, setSavedEntries } = ctx;
  return (
    <>
    {/* Entries collected so far */}
    <div className="max-h-[260px] min-h-[120px] overflow-y-auto bg-[#f7f9fc] shadow-[inset_0_1px_0_rgb(234,238,244)]">
      {savedEntries.length === 0 ? (
        <div className="px-5 py-7 text-center text-[13px] leading-5 text-muted-foreground">
          Type one line per task and press Enter.
          <br />
          Entries collect here until you save them.
        </div>
      ) : (
        savedEntries.map((entry, index) => (
          <div
            key={`${entry.project_id}-${entry.deliverable_id}-${entry.deliverable_type}-${index}`}
            className="flex items-center gap-3 px-5 py-2.5 text-[13px] shadow-[inset_0_-1px_0_rgb(234,238,244)]"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium text-foreground">
                {entry.deliverable_not_available
                  ? NOT_AVAILABLE_LABEL
                  : entry.deliverable_name || entry.deliverable_type}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {[
                  clientMap.get(entry.client_id)?.name,
                  projectMap.get(entry.project_id)?.name,
                  entry.deliverable_type,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatDuration(entry.time_taken_minutes)}
            </span>
            <button
              type="button"
              aria-label="Remove entry"
              onClick={() =>
                setSavedEntries((prev) => prev.filter((_, i) => i !== index))
              }
              className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-slate-200"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))
      )}
    </div>
    </>
  );
}
