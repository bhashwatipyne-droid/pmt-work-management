import { ChevronRight, Clock, Plus, Search, Upload, X } from "lucide-react";
import { Avatar, Badge, CountPill, DeliverableNameInput, Dot, GroupHeader } from "@/components/projects/detail/parts";
import { DELIVERABLE_STATUS, DELIV_GRID, HAIRLINE, HEAD_ROW, LOG_GRID, NEUTRAL_400, STAGE_DOT, WORK_STATUS_BADGE, fmtDay, fmtMin, fmtWindow, isOverdue, stageWindow, statusOf } from "@/components/projects/detail/projectDetailView";

export function ProjectTabsPanel({ canLogWork, canManage, closedGroups, deliverableGroups, handleRename, isDeliv, loggedMinutes, openQuickLog, people, q, query, setDelivModal, setImportOpen, setQuery, setStageFilter, setTab, stageFilter, statsH, tab, toggleGroup, total, userName, workGroups, workItems, workLogTotal }) {
  return (
    <>
    {/* Tabs panel */}
    <div className={`flex flex-col overflow-clip rounded-xl bg-white ${HAIRLINE}`}>
      {/* Tabs + toolbar stay pinned under the stats block on desktop. */}
      <div
        className="z-10 bg-white md:sticky md:top-[var(--stats-h,0px)]"
        style={{ "--stats-h": `${statsH}px` }}
      >
      <div
        role="tablist"
        aria-label="Project sections"
        className="flex items-center gap-1 px-4 shadow-[inset_0_-1px_0_rgb(234,238,244)]"
      >
        {[
          ["deliverables", "Deliverables", total],
          ["log", "Work log", workLogTotal],
        ].map(([key, label, count]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setTab(key);
                setQuery("");
              }}
              className={`flex h-11 items-center gap-2 px-2.5 text-sm font-semibold ${
                active
                  ? "text-[rgb(13,27,62)] shadow-[inset_0_-2px_0_rgb(43,43,181)]"
                  : "text-[rgb(84,100,144)]"
              }`}
            >
              {label}
              <CountPill className="px-[7px] py-px">{count}</CountPill>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <label className="flex h-8 min-w-[200px] flex-[0_1_300px] items-center gap-2 rounded-[7px] bg-white px-2.5 text-[rgb(84,100,144)] shadow-[inset_0_0_0_1px_rgb(239,240,242)]">
          <Search className="h-3.5 w-3.5" />
          <input
            aria-label={isDeliv ? "Search deliverables" : "Search work log"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isDeliv ? "Search deliverables" : "Search work log"}
            className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-[rgb(13,27,62)] outline-none placeholder:text-[rgb(84,100,144)]"
          />
        </label>

        {isDeliv && stageFilter !== "all" && (
          <button
            type="button"
            onClick={() => setStageFilter("all")}
            className="flex h-7 items-center gap-1.5 rounded-full bg-[rgb(240,240,253)] pl-2.5 pr-2 text-xs font-semibold text-[rgb(26,26,138)] shadow-[inset_0_0_0_1px_rgb(144,144,236)]"
          >
            Stage: {stageFilter}
            <X className="h-2.5 w-2.5" />
          </button>
        )}

        <span className="flex-1" />

        {isDeliv && canManage && (
          <div className="flex gap-2">
            <button
              type="button"
              data-testid="project-detail-import-deliverables-btn"
              onClick={() => setImportOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[rgb(245,246,248)] px-3.5 text-xs font-semibold leading-4 text-[rgb(74,88,120)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] transition-colors hover:bg-[rgb(243,244,246)] focus:outline-none focus-visible:shadow-[inset_0_0_0_1px_rgb(239,240,242),0_0_0_3px_rgb(220,220,248)]"
            >
              <Upload className="h-3.5 w-3.5" />
              Import
            </button>
            <button
              type="button"
              data-testid="project-detail-add-deliverable-btn"
              onClick={() => setDelivModal({ open: true, mode: "add", initial: null })}
              className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[rgb(43,43,181)] px-3.5 text-xs font-semibold leading-4 text-white transition-colors hover:bg-[rgb(61,61,204)] focus:outline-none focus-visible:shadow-[0_0_0_3px_rgb(220,220,248)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add deliverable
            </button>
          </div>
        )}

        {!isDeliv && canLogWork && (
          <button
            type="button"
            onClick={openQuickLog}
            className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[rgb(43,43,181)] px-3.5 text-xs font-semibold leading-4 text-white transition-colors hover:bg-[rgb(61,61,204)] focus:outline-none focus-visible:shadow-[0_0_0_3px_rgb(220,220,248)]"
          >
            <Clock className="h-3.5 w-3.5" />
            Log time
          </button>
        )}
      </div>
      </div>

      {isDeliv ? (
        <div className="overflow-x-auto">
          <div className="md:min-w-[860px]">
            <div className={`${DELIV_GRID} ${HEAD_ROW} max-md:hidden`}>
              <span>Deliverable</span>
              <span>Workflow</span>
              <span>Status</span>
              <span>Schedule</span>
            </div>

            {deliverableGroups.map((g) => {
              const key = `d:${g.stage}`;
              const open = !closedGroups[key];
              return (
                <div key={g.stage}>
                  <GroupHeader
                    open={open}
                    onToggle={() => toggleGroup(key)}
                    dot={STAGE_DOT[g.stage]}
                    name={g.stage}
                    meta={`${g.rows.length} · ${g.done} done`}
                  />
                  {open &&
                    g.rows.map((d) => {
                      const status =
                        DELIVERABLE_STATUS[statusOf(d)] ||
                        DELIVERABLE_STATUS["Not Started"];
                      const flow = d.required_stages?.length
                        ? d.required_stages
                        : [d.current_stage];
                      const win = stageWindow(d);
                      const overdue = isOverdue(d);
                      return (
                        <div
                          key={d.id}
                          data-testid={`project-detail-deliverable-${d.id}`}
                          role={canManage ? "button" : undefined}
                          tabIndex={canManage ? 0 : undefined}
                          title={canManage ? "Edit deliverable" : undefined}
                          onClick={
                            canManage
                              ? () => setDelivModal({ open: true, mode: "edit", initial: d })
                              : undefined
                          }
                          onKeyDown={
                            canManage
                              ? (e) => {
                                  if (e.key === "Enter") {
                                    setDelivModal({ open: true, mode: "edit", initial: d });
                                  }
                                }
                              : undefined
                          }
                          className={`${DELIV_GRID} min-h-[52px] items-center pl-[34px] pr-4 text-sm max-md:py-2 max-md:pl-4 shadow-[inset_0_-1px_0_rgb(243,244,246)] hover:bg-[rgb(249,250,251)] ${
                            canManage ? "cursor-pointer focus:bg-[rgb(249,250,251)] focus:outline-none" : ""
                          }`}
                        >
                          <span className="flex min-w-0 flex-col gap-0.5 py-1.5 max-md:order-1">
                            {canManage ? (
                              <DeliverableNameInput
                                name={d.name}
                                onSave={(name) => handleRename(d, name)}
                              />
                            ) : (
                              <span
                                className="truncate text-sm font-medium leading-[26px] text-[rgb(13,27,62)]"
                                title={d.name}
                              >
                                {d.name}
                              </span>
                            )}
                            <span className="text-xs text-[rgb(84,100,144)]">
                              {d.type || "—"}
                            </span>
                          </span>

                          <span className="flex flex-wrap items-center gap-1 text-xs text-[rgb(74,88,120)] max-md:order-3">
                            {flow.map((stage, i) => (
                              <span key={stage} className="flex items-center gap-1">
                                <span className="flex items-center gap-[5px]">
                                  <Dot color={STAGE_DOT[stage] || NEUTRAL_400} size={6} />
                                  {stage}
                                </span>
                                {i < flow.length - 1 && (
                                  <ChevronRight className="h-3 w-3 text-[rgb(138,151,181)]" />
                                )}
                              </span>
                            ))}
                          </span>

                          <span className="p-0.5 max-md:order-2 max-md:justify-self-end">
                            <Badge color={status.badge}>{status.label}</Badge>
                          </span>

                          <span
                            className={`text-[13px] tabular-nums max-md:order-4 max-md:justify-self-end ${
                              overdue ? "text-[rgb(239,68,68)]" : "text-[rgb(84,100,144)]"
                            }`}
                            title={overdue ? `${d.current_stage} is overdue` : undefined}
                          >
                            {fmtWindow(win.start, win.end)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              );
            })}

            {deliverableGroups.length === 0 && (
              <div className="px-4 py-10 text-center text-[13px] text-[rgb(84,100,144)]">
                {total === 0 && !q && stageFilter === "all"
                  ? "No deliverables yet."
                  : "No deliverables match this search."}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start">
          <div className="min-w-0 flex-[1_1_620px] overflow-x-auto">
            <div className="min-w-[720px]">
              <div className={`${LOG_GRID} ${HEAD_ROW}`}>
                <span>Member</span>
                <span>Deliverable</span>
                <span>Stage</span>
                <span className="text-right">Time</span>
                <span>Status</span>
              </div>

              {workGroups.map((g) => {
                const key = `w:${g.date}`;
                const open = !closedGroups[key];
                return (
                  <div key={g.date}>
                    <GroupHeader
                      open={open}
                      onToggle={() => toggleGroup(key)}
                      name={fmtDay(g.date)}
                      meta={`${g.rows.length} ${g.rows.length > 1 ? "entries" : "entry"} · ${fmtMin(g.minutes)}`}
                    />
                    {open &&
                      g.rows.map((w) => {
                        const by = userName[w.creator_id] || "—";
                        return (
                          <div
                            key={w.id}
                            className={`${LOG_GRID} min-h-12 items-center pl-[34px] pr-4 text-sm shadow-[inset_0_-1px_0_rgb(243,244,246)] hover:bg-[rgb(249,250,251)]`}
                          >
                            <span className="flex min-w-0 items-center gap-2 text-[13px] text-[rgb(74,88,120)]">
                              <Avatar name={by} />
                              <span className="truncate" title={by}>
                                {by}
                              </span>
                            </span>
                            <span
                              className="truncate text-[rgb(13,27,62)]"
                              title={w.deliverable_name || ""}
                            >
                              {w.deliverable_name || "—"}
                            </span>
                            <span className="flex items-center gap-1.5 text-[13px] text-[rgb(74,88,120)]">
                              <Dot color={STAGE_DOT[w.stage] || NEUTRAL_400} size={6} />
                              {w.stage || "—"}
                            </span>
                            <span className="text-right text-[13px] tabular-nums text-[rgb(74,88,120)]">
                              {fmtMin(w.time_taken_minutes)}
                            </span>
                            <span>
                              <Badge color={WORK_STATUS_BADGE[w.status] || "Neutral"}>
                                {w.status || "Not Started"}
                              </Badge>
                            </span>
                          </div>
                        );
                      })}
                  </div>
                );
              })}

              {workGroups.length === 0 && (
                <div className="px-4 py-10 text-center text-[13px] text-[rgb(84,100,144)]">
                  {workItems.length === 0
                    ? "No work logged yet for this project."
                    : "No entries match this search."}
                </div>
              )}

              {workLogTotal > workItems.length && (
                <div className="px-4 py-3 text-xs text-[rgb(84,100,144)]">
                  Showing the latest {workItems.length} of {workLogTotal} entries.
                </div>
              )}
            </div>
          </div>

          <div className="flex min-w-[240px] flex-[0_1_280px] flex-col gap-3 p-4 shadow-[inset_1px_0_0_rgb(234,238,244)]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] font-semibold text-[rgb(13,27,62)]">
                Time by member
              </span>
              <span className="text-xs text-[rgb(84,100,144)]">
                {fmtMin(loggedMinutes)} total
              </span>
            </div>
            {people.map((m) => (
              <div key={m.name} className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[13px]">
                  <Avatar name={m.name} size={22} />
                  <span className="min-w-0 flex-1 truncate text-[rgb(74,88,120)]">
                    {m.name}
                  </span>
                  <span className="font-medium tabular-nums text-[rgb(13,27,62)]">
                    {fmtMin(m.minutes)}
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-[rgb(245,246,248)]">
                  <div
                    className="h-full rounded-full bg-[rgb(61,61,204)]"
                    style={{ width: `${m.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
