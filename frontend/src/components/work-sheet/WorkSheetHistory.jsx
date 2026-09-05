import { useEffect, useState } from "react";
import { X, History } from "lucide-react";
import { getWorkItemHistory } from "@/services/api";

const formatDate = (value) => {
  if (!value) return "";

  const date = new Date(value);

  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const ACTION_LABELS = {
  WORK_ITEM_STATUS_CHANGED: "Status changed",
  WORK_ITEM_STAGE_CHANGED: "Stage changed",
  WORK_ITEM_APPROVED: "Work item approved",
  WORK_ITEM_REWORKED: "Work item sent for rework",
};

const getActionLabel = (action) => {
  return (
    ACTION_LABELS[action] ||
    action
      ?.replaceAll("_", " ")
      .toLowerCase()
      .replace(/^./, (char) => char.toUpperCase()) ||
    "Work item updated"
  );
};

export const WorkSheetHistory = ({
  open,
  onClose,
  stage,
}) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;

    const loadHistory = async () => {
      setLoading(true);

      try {
        const data = await getWorkItemHistory(stage);
        setLogs(data || []);
      } catch (error) {
        console.error(
          "Failed to load worksheet history",
          error
        );
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [open, stage]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close version history"
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="relative ml-auto flex h-full w-[420px] max-w-[90vw] flex-col border-l border-border bg-background shadow-xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />

              <h2 className="text-base font-semibold">
                Version history
              </h2>
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              {stage === "Master"
                ? "All work items"
                : `${stage} sheet`}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Loading history...
            </div>
          ) : logs.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div>
                <History className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />

                <p className="text-sm font-medium">
                  No history yet
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Changes to this sheet will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="px-5 py-4"
                >
                  <div className="flex gap-3">
                    {/* Timeline dot */}
                    <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-teal-600" />

                    <div className="min-w-0 flex-1">
                      {/* User + timestamp */}
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">
                          {log.changed_by_name}
                        </p>

                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(log.changed_at)}
                        </span>
                      </div>

                      {/* Action */}
                      <p className="mt-1 text-sm">
                        {getActionLabel(log.action)}
                      </p>

                      {/* Work item */}
                      {log.work_item_name && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {log.work_item_name}
                        </p>
                      )}

                      {/* Change */}
                      {log.old_value !== undefined &&
                        log.new_value !== undefined && (
                          <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-xs">
                            <span className="text-muted-foreground">
                              {String(log.old_value || "—")}
                            </span>

                            <span className="mx-2 text-muted-foreground">
                              →
                            </span>

                            <span className="font-medium">
                              {String(log.new_value || "—")}
                            </span>
                          </div>
                        )}

                      {/* Review note */}
                      {log.metadata?.review_note && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {log.metadata.review_note}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};