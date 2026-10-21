import { ArrowRight, FileText, Palette, Play } from "lucide-react";
import { Badge, Block, Empty, SectionHead } from "./dashboardParts";
import { C, CARD, HEAD_ROW, LEVEL_BADGE, LINK_BTN, PORT_GRID, ROW_DIVIDER, STAGE_DOT } from "./dashboardTheme";
import { Fragment } from "react";

export function RiskTab(ctx) {
  const { delayTotal, goProject, h, navigate, setCat, setShowAllProjects, setTeam, showAllProjects, shownProjects, team } = ctx;
  return (
    <>
    <>
      <Block title="What is driving the problem?">
        <section className={`${CARD} flex flex-col`}>
          <SectionHead
            title="Delay attribution by team"
            sub={`Each delayed deliverable counts once against the team where it is stuck. Out of ${delayTotal} delayed this month.`}
          />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 px-4 pb-4">
            {h.delayTeams.map((d) => {
              const on = team === d.team;
              const icon = {
                Content: [FileText, C.info100, C.infoText],
                Design: [Palette, C.brand50, C.brand700],
                Animate: [Play, C.success100, C.successText],
              }[d.team];
              const [Icon, ibg, ifg] = icon;
              const facts = [
                ["Person", d.person],
                ["Client", d.client],
                ["Project", d.project],
              ];
              return (
                <button
                  key={d.team}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setTeam(on ? "All" : d.team);
                    setCat("all");
                  }}
                  className="flex min-w-0 flex-col gap-3 rounded-[10px] p-4 text-left transition-[box-shadow,background] duration-100 hover:shadow-[inset_0_0_0_1px_rgb(144,144,236)]"
                  style={{
                    background: on ? C.brand50 : "#fff",
                    boxShadow: on ? `inset 0 0 0 2px ${C.brand500}` : "inset 0 0 0 1px rgb(234,238,244)",
                  }}
                >
                  <span className="flex items-start gap-3">
                    <span className="flex flex-1 flex-col gap-1">
                      <span className="text-[14px] font-semibold text-[rgb(13,27,62)]">{d.team}</span>
                      <span className="flex items-baseline gap-1">
                        <span className="text-[28px] font-bold leading-9 text-[rgb(13,27,62)]">{d.count}</span>
                        <span className="text-[14px] text-[rgb(138,151,181)]">/ {delayTotal}</span>
                      </span>
                      <span className="text-[12px] text-[rgb(84,100,144)]">{d.share}% of delayed deliverables</span>
                    </span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: ibg, color: ifg }}>
                      <Icon className="h-4 w-4" />
                    </span>
                  </span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-[rgb(245,246,248)]">
                    <span className="block h-full rounded-full" style={{ width: `${d.share}%`, background: STAGE_DOT[d.team] }} />
                  </span>
                  <span className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-3 gap-y-2 pt-3 text-[13px] shadow-[inset_0_1px_0_rgb(243,244,246)]">
                    {facts.map(([k, v]) => (
                      <Fragment key={k}>
                        <span className="text-[12px] text-[rgb(84,100,144)]">{k}</span>
                        <span className="truncate font-medium text-[rgb(13,27,62)]" title={v?.name}>
                          {v ? v.name : "—"}
                          {v && <span className="font-normal text-[rgb(138,151,181)]"> · {v.n}</span>}
                        </span>
                      </Fragment>
                    ))}
                  </span>
                  <span className="flex items-center gap-1 pt-2.5 text-[12px] font-semibold shadow-[inset_0_1px_0_rgb(243,244,246)]" style={{ color: on ? C.brand700 : C.brand500 }}>
                    {on ? "Current team view · show all teams" : `View ${d.team} dashboard`}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </Block>

      <Block title="Where is risk concentrated?">
        <section className={`${CARD} flex min-w-0 flex-col`}>
          <SectionHead title="Portfolio health" sub="Compare projects at a glance. Click one to open it.">
            <button type="button" onClick={() => navigate("/projects")} className={LINK_BTN}>
              All projects
              <ArrowRight className="h-4 w-4" />
            </button>
          </SectionHead>
          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              <div className={`${PORT_GRID} ${HEAD_ROW}`}>
                <span>Client / project</span>
                <span className="text-right">Active</span>
                <span className="text-right">At risk</span>
                <span className="text-right">Delayed</span>
                <span className="text-right">Review</span>
                <span className="text-right">On time</span>
                <span>Attention</span>
              </div>
              {shownProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => goProject(p.id)}
                  className={`${PORT_GRID} min-h-[52px] w-full items-center bg-white px-4 py-1.5 text-left text-[14px] tabular-nums ${ROW_DIVIDER} hover:bg-[rgb(249,250,251)]`}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium text-[rgb(13,27,62)]" title={p.name}>{p.name}</span>
                    <span className="truncate text-[12px] text-[rgb(84,100,144)]">{p.client}</span>
                  </span>
                  <span className="text-right text-[rgb(74,88,120)]">{p.active}</span>
                  <span className="text-right font-medium" style={{ color: p.risk ? C.warningText : C.n400 }}>{p.risk}</span>
                  <span className="text-right font-medium" style={{ color: p.delay ? C.error500 : C.n400 }}>{p.delay}</span>
                  <span className="text-right text-[rgb(74,88,120)]">{p.review}</span>
                  <span
                    className="text-right font-semibold"
                    style={{ color: p.onTime >= 85 ? C.successText : p.onTime >= 70 ? C.warningText : C.error500 }}
                  >
                    {p.onTime}%
                  </span>
                  <span><Badge color={LEVEL_BADGE[p.level]}>{p.level}</Badge></span>
                </button>
              ))}
              {h.portfolio.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowAllProjects((s) => !s)}
                  className="h-10 w-full bg-white text-[13px] font-semibold text-[rgb(43,43,181)] hover:bg-[rgb(240,240,253)]"
                >
                  {showAllProjects ? "Show fewer" : `Show all ${h.portfolio.length} projects`}
                </button>
              )}
              {h.portfolio.length === 0 && <Empty>No projects match the current filters.</Empty>}
            </div>
          </div>
        </section>
      </Block>
    </>
    </>
  );
}
