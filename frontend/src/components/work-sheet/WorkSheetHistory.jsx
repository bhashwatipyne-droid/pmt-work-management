import { useEffect, useState } from "react";
import { X, History, ArrowRight } from "lucide-react";
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
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Panel */}
      <aside className="relative ml-auto flex h-full w-[440px] max-w-[92vw] flex-col border-l border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border bg-card px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0f0fd]">
                <History className="h-4 w-4 text-[#2b2bb5]" />
              </div>

              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Version history
                </h2>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stage === "Master"
                    ? "All work items"
                    : `${stage} sheet`}
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-[#f7f9fc]">
          {loading ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="text-center">
                <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-[#dcdcf8] border-t-[#2b2bb5]" />

                <p className="text-sm font-medium text-foreground">
                  Loading history
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  Fetching recent changes...
                </p>
              </div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6 text-center">
              <div className="max-w-[260px]">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f0fd]">
                  <History className="h-5 w-5 text-[#2b2bb5]" />
                </div>

                <p className="text-sm font-semibold text-foreground">
                  No history yet
                </p>

                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Changes made to this sheet will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="bg-card px-5 py-4 transition-colors hover:bg-[#fafbff]"
                >
                  <div className="flex gap-3">
                    {/* Timeline */}
                    <div className="relative flex w-3 shrink-0 justify-center">
                      <div className="mt-1.5 h-2 w-2 rounded-full bg-[#2b2bb5]" />
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* User + timestamp */}
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                          {log.changed_by_name}
                        </p>

                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatDate(log.changed_at)}
                        </span>
                      </div>

                      {/* Action */}
                      <p className="mt-1 text-sm text-foreground">
                        {getActionLabel(log.action)}
                      </p>

                      {/* Work item */}
                      {log.work_item_name && (
                        <div className="mt-1.5">
                          <span className="text-xs text-muted-foreground">
                            {log.work_item_name}
                          </span>
                        </div>
                      )}

                      {/* Change */}
                      {log.old_value !== undefined &&
                        log.new_value !== undefined && (
                          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-[#f7f9fc] px-3 py-2">
                            <span className="min-w-0 truncate text-xs text-muted-foreground">
                              {String(log.old_value || "—")}
                            </span>

                            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />

                            <span className="min-w-0 truncate text-xs font-semibold text-foreground">
                              {String(log.new_value || "—")}
                            </span>
                          </div>
                        )}

                      {/* Review note */}
                      {log.metadata?.review_note && (
                        <div className="mt-2 rounded-lg border border-border bg-card px-3 py-2">
                          <p className="text-xs leading-5 text-muted-foreground">
                            {log.metadata.review_note}
                          </p>
                        </div>
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