import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { ago, rangeTitle } from "@/components/meetings/meetingsLogic";

export function MeetingsToolbar(ctx) {
  const { anchor, currentUser, lastSync, loading, setAnchor, setView, status, step, syncNow, syncing, view } = ctx;
  return (
    <>
    <div className="flex flex-wrap items-center gap-2 border-b border-[#eaeef4] px-3 py-3 md:px-5">
      <h1 className="mr-2 text-xl font-semibold tracking-tight text-[#0d1b3e] md:text-2xl">Meetings</h1>
      <button
        type="button"
        onClick={() => setAnchor(new Date())}
        className="h-8 rounded-md border border-[#e2e6f0] px-3 text-[13px] font-medium text-[#0d1b3e] hover:bg-[#f5f6fb]"
      >
        Today
      </button>
      <div className="flex items-center">
        <button type="button" aria-label="Previous" onClick={() => step(-1)} className="grid h-8 w-8 place-items-center rounded-full text-[#546490] hover:bg-[#f0f2f8]">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button type="button" aria-label="Next" onClick={() => step(1)} className="grid h-8 w-8 place-items-center rounded-full text-[#546490] hover:bg-[#f0f2f8]">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <h2 className="min-w-0 flex-1 truncate text-[16px] font-medium text-[#0d1b3e] md:text-[18px]">{rangeTitle(view, anchor)}</h2>
      <span className="hidden text-[12px] text-[#94a0bf] md:inline">
        {loading ? "Loading…" : `Synced ${ago(lastSync)}`}
        {!loading && status?.calendars?.length > 0 && status.calendars.every((c) => c.push?.active) ? " · live updates on" : ""}
      </span>
      {currentUser?.role === "admin" && status?.configured && (
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing}
          title="Fetch from Google now"
          className="grid h-8 w-8 place-items-center rounded-md border border-[#e2e6f0] text-[#546490] hover:bg-[#f5f6fb] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        </button>
      )}
      <div role="tablist" aria-label="View" className="inline-flex h-8 rounded-md border border-[#e2e6f0] p-0.5">
        {[
          ["day", "Day"],
          ["week", "Week"],
          ["month", "Month"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`rounded px-3 text-[13px] ${view === key ? "bg-[#f0f0fd] font-semibold text-[#1a1a8a]" : "text-[#546490] hover:text-[#0d1b3e]"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
    </>
  );
}
