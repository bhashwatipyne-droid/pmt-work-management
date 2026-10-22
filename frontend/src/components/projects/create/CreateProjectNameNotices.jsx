import { AlertCircle, Check } from "lucide-react";
import { smallButton } from "@/components/projects/createProjectLogic";

export function CreateProjectNameNotices(ctx) {
  const { confirmed, exact, matchRow, matches, nameState, openProject, otherClientMatches, recentDismissed, recentOnly, sameClientMatches, setRecentDismissed, selectedClient, setConfirmed } = ctx;
  return (
    <>
    {nameState === "clear" && selectedClient && recentOnly.length === 0 && (
      <div className="-mt-2 flex items-center gap-2 text-[13px] text-emerald-800">
        <Check className="h-3.5 w-3.5" />
        No similar project for {selectedClient.name} or other clients.
      </div>
    )}

    {matches.length > 0 && (
      <div className="-mt-1.5 flex flex-col overflow-hidden rounded-xl border border-border">
        {exact ? (
          <div className="flex items-start gap-2.5 bg-red-50 px-3.5 py-3 text-[13px] leading-[18px]">
            <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-500" />
            <span className="text-foreground">
              <strong className="font-semibold">This project already exists for this client.</strong>{" "}
              Open it and add deliverables there, or confirm below if this is a different project.
            </span>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 bg-amber-100 px-3.5 py-3 text-[13px] leading-[18px]">
            <AlertCircle className="mt-px h-4 w-4 shrink-0 text-amber-800" />
            <span className="text-foreground">
              <strong className="font-semibold">Similar projects found.</strong> Check these before
              creating a new one.
            </span>
          </div>
        )}
        {sameClientMatches.length > 0 && (
          <>
            <span className="px-3.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Same client
            </span>
            {sameClientMatches.map(matchRow)}
          </>
        )}
        {otherClientMatches.length > 0 && (
          <>
            <span className="px-3.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Other clients
            </span>
            {otherClientMatches.map(matchRow)}
          </>
        )}
        {(
          <button
            type="button"
            role="checkbox"
            aria-checked={confirmed}
            onClick={() => setConfirmed((v) => !v)}
            className="flex items-center gap-2.5 border-t border-border bg-slate-50 px-3.5 py-3 text-left text-[13px] text-foreground"
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                confirmed ? "bg-[#2b2bb5] text-white" : "border border-slate-300 bg-white"
              }`}
            >
              {confirmed && <Check className="h-3 w-3" />}
            </span>
            {exact ? "This is not a duplicate. Create it anyway." : "None of these. This is a new project."}
          </button>
        )}
      </div>
    )}

    {/* Same name, same client, last 30 days: a warning only. It can be a
        genuine repeat (a monthly edition), so nothing here blocks Create. */}
    {recentOnly.length > 0 && selectedClient && !recentDismissed && (
      <div
        data-testid="create-project-recent-duplicate-warning"
        className="-mt-1.5 flex flex-col overflow-hidden rounded-xl border border-border"
      >
        <div className="flex items-start gap-2.5 bg-amber-100 px-3.5 py-3 text-[13px] leading-[18px]">
          <AlertCircle className="mt-px h-4 w-4 shrink-0 text-amber-800" />
          <span className="text-foreground">
            <strong className="font-semibold">
              {recentOnly.length === 1
                ? "A project with this name was added for this client recently."
                : `${recentOnly.length} projects with this name were added for this client recently.`}
            </strong>{" "}
            If this is a repeat job, carry on. If it is the same work, open it instead.
          </span>
          <button
            type="button"
            onClick={() => setRecentDismissed(true)}
            className="ml-auto shrink-0 text-[12px] font-medium text-amber-900 underline"
          >
            Dismiss
          </button>
        </div>
        {recentOnly.map((d) => (
          <div
            key={d.id}
            className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-3.5 py-2.5"
          >
            <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
              <button
                type="button"
                onClick={() => openProject(d)}
                className="text-left text-sm font-semibold text-foreground underline-offset-2 hover:text-[#2b2bb5] hover:underline"
              >
                {d.name}
              </button>
              <span className="text-xs text-muted-foreground">
                {[
                  d.code,
                  d.status,
                  d.days_ago === 0
                    ? "added today"
                    : `added ${d.days_ago} ${d.days_ago === 1 ? "day" : "days"} ago`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <button type="button" className={smallButton} onClick={() => openProject(d)}>
              Open project
            </button>
          </div>
        ))}
      </div>
    )}
    </>
  );
}
