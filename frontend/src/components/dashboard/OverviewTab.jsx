import { ArrowRight, ChevronRight } from "lucide-react";
import { Badge, Block, Dot, Empty, Pill, SectionHead, StatTile } from "./dashboardParts";
import { C, CARD, EYEBROW, NEXT_BADGE, ROW_DIVIDER, STAGE_DOT } from "./dashboardTheme";
import { addDays, fmtDay, fmtWeekday, pc } from "@/lib/homeDashboard";

export function OverviewTab(ctx) {
  const { cats, critCount, data, glance, goProject, h, kpis, label, nextDue, openActions, projects, today, userName } = ctx;
  return (
    <>
    <>
      <section aria-label="This month at a glance" className={`${CARD} flex flex-wrap items-center gap-x-8 gap-y-4 p-5`}>
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3">
          <span className={EYEBROW}>At a glance · {label}</span>
          {glance.map((g) => (
            <div key={g.lead} className="flex items-start gap-2.5 text-[15px] leading-[22px] text-[rgb(74,88,120)]">
              <Dot color={g.dot} className="mt-[7px]" />
              <span className="[text-wrap:pretty]">
                <strong className="font-semibold text-[rgb(13,27,62)]">{g.lead}</strong> {g.rest}
              </span>
            </div>
          ))}
        </div>
        {(data.unscheduled || []).length > 0 && (
          <details className="basis-full text-[12px] text-[rgb(138,151,181)]">
            <summary className="cursor-pointer">
              {data.unscheduled.length} open deliverable{data.unscheduled.length === 1 ? "" : "s"} ha{data.unscheduled.length === 1 ? "s" : "ve"} no due date, on the deliverable or its project, so they are not counted.
            </summary>
            <ul className="mt-1.5 flex flex-col gap-1 pl-4">
              {data.unscheduled.slice(0, 20).map((u) => (
                <li key={u.id}>
                  <button type="button" onClick={() => goProject(u.project_id)} className="text-left text-[rgb(84,100,144)] hover:underline">
                    {u.name || u.id} · {u.project || "Project"}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
        <button
          type="button"
          onClick={() => openActions(critCount ? "crit" : "all")}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-[7px] bg-[rgb(43,43,181)] px-4 text-[13px] font-semibold leading-[18px] text-white transition-colors hover:bg-[rgb(61,61,204)]"
        >
          {critCount ? `Review ${critCount} critical action${critCount === 1 ? "" : "s"}` : "Review actions"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </section>

      <Block title="Where are we?">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {kpis.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={k.go}
              className={`${CARD} flex min-w-0 flex-col gap-2 p-4 text-left transition-shadow duration-100 hover:shadow-[inset_0_0_0_1px_rgb(144,144,236)]`}
            >
              <span className="flex items-center gap-2 text-[13px] font-medium text-[rgb(74,88,120)]">
                <Dot color={k.dot} />
                {k.label}
              </span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-[32px] font-bold leading-10 text-[rgb(13,27,62)]">{k.value}</span>
                <span className="text-[14px] text-[rgb(138,151,181)]">/ {k.den}</span>
              </span>
              <span className="h-1 overflow-hidden rounded-full bg-[rgb(245,246,248)]">
                <span className="block h-full rounded-full" style={{ width: `${pc(k.value, k.den)}%`, background: k.dot }} />
              </span>
              <span className="text-[12px] leading-4 text-[rgb(84,100,144)]">
                {pc(k.value, k.den)}% of {k.denLabel} · {h.projectsOf(k.rows)} projects
              </span>
              {k.note && <span className="text-[12px] leading-4 text-[rgb(138,151,181)]">{k.note}</span>}
              {k.extra && (
                <Pill bg={k.extra.good ? C.success100 : C.error50} fg={k.extra.good ? C.successText : C.error500}>
                  {k.extra.text}
                </Pill>
              )}
            </button>
          ))}
        </div>
      </Block>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-start gap-4">
        <Block title="What needs attention now?">
          <section className={`${CARD} flex flex-col overflow-hidden`}>
            {cats.map(({ key, label: l, sub, Icon, bg, fg, value, den }) => (
              <button
                key={key}
                type="button"
                onClick={() => openActions(key)}
                className={`flex items-center gap-3.5 bg-white px-4 py-3.5 text-left ${ROW_DIVIDER} hover:bg-[rgb(249,250,251)]`}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: bg, color: fg }}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[14px] font-medium text-[rgb(13,27,62)]">{l}</span>
                  <span className="text-[12px] leading-4 text-[rgb(84,100,144)] [text-wrap:pretty]">{pc(value, den)}% {sub}</span>
                </span>
                <span className="flex shrink-0 items-baseline gap-[3px]">
                  <span className="text-xl font-semibold leading-6 text-[rgb(13,27,62)]">{value}</span>
                  <span className="text-[12px] text-[rgb(138,151,181)]">/ {den}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-[rgb(138,151,181)]" />
              </button>
            ))}
          </section>
        </Block>

        <Block title="What is coming next?">
          <section className={`${CARD} flex min-w-0 flex-col`}>
            <SectionHead
              title="Next 7 days"
              sub={`Work due ${fmtDay(today)} – ${fmtDay(addDays(today, 7))}. Click an item to open its project.`}
            />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2 px-4 pb-3">
              <StatTile label="Due" value={nextDue} />
              <StatTile label="At risk" value={`${h.nextCount("At risk")} / ${nextDue}`} sub={`${pc(h.nextCount("At risk"), nextDue)}% of due`} color={C.warningText} />
              <StatTile label="In review" value={`${h.nextCount("In review")} / ${nextDue}`} sub={`${pc(h.nextCount("In review"), nextDue)}% of due`} color={C.infoText} />
              <StatTile label="Already delayed" value={`${h.nextCount("Delayed")} / ${nextDue}`} sub={`${pc(h.nextCount("Delayed"), nextDue)}% of due`} color={C.error500} />
            </div>
            {nextDue > 0 && (
              <div className="mx-4 mb-3 rounded-lg bg-[rgb(209,250,229)] px-3 py-2 text-[12px] leading-4 text-[rgb(0,91,75)]">
                {nextDue - h.nextCount("Delayed")} items should close or move forward if current blockers are resolved.
              </div>
            )}
            {h.next.slice(0, 7).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => goProject(n.project_id)}
                className="flex items-center gap-3 bg-white px-4 py-2.5 text-left shadow-[inset_0_1px_0_rgb(243,244,246)] hover:bg-[rgb(249,250,251)]"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="truncate text-[14px] font-medium text-[rgb(13,27,62)]">{n.name}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-[rgb(84,100,144)]">
                    <Dot color={STAGE_DOT[n.stage]} size={6} />
                    <span className="truncate" title={projects[n.project_id]?.name}>
                      {projects[n.project_id]?.name} · {n.stage} · {n.owner_id ? userName[n.owner_id] || "Unknown" : "Unassigned"}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[12px] font-medium text-[rgb(74,88,120)]">{fmtWeekday(n.final_due)}</span>
                  <Badge color={NEXT_BADGE[n.next_status]}>{n.next_status}</Badge>
                </span>
              </button>
            ))}
            {nextDue === 0 && <Empty>Nothing due in the next 7 days for this view.</Empty>}
          </section>
        </Block>
      </div>
    </>
    </>
  );
}
