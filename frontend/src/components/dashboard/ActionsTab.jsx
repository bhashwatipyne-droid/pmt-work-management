import { ACTION_GRID, C, CARD, HEAD_ROW, PRI_BADGE, ROW_DIVIDER, STAGE_DOT } from "./dashboardTheme";
import { Avatar, Badge, Block, Dot, Empty, SectionHead } from "./dashboardParts";
import { ChevronRight } from "lucide-react";

export function ActionsTab(ctx) {
  const { actionsInCat, cat, cats, goProject, setCat, setShowAllActions, showAllActions, shownActions } = ctx;
  return (
    <>
    <Block title="What should management act on?">
      <section className={`${CARD} flex flex-col`}>
        <SectionHead title="Priority action queue" sub="Issue → evidence → owner → resolve-by → age." />
        <div role="radiogroup" aria-label="Filter actions" className="flex flex-wrap gap-2 px-4 pb-3">
          {[{ key: "all", label: "All" }, ...cats].map((c) => {
            const on = cat === c.key;
            return (
              <button
                key={c.key}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setCat(on && c.key !== "all" ? "all" : c.key);
                  setShowAllActions(false);
                }}
                className="flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold"
                style={{
                  background: on ? C.brand50 : "#fff",
                  color: on ? C.brand700 : C.n700,
                  boxShadow: `inset 0 0 0 1px ${on ? C.brand500 : "rgb(239,240,242)"}`,
                }}
              >
                {c.label}
                {c.key !== "all" && <span className="font-medium text-[rgb(84,100,144)]">{c.value}</span>}
              </button>
            );
          })}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[880px]">
            <div className={`${ACTION_GRID} ${HEAD_ROW}`}>
              <span>Priority</span><span>Action / evidence</span><span>Owner / approver</span><span>Resolve by</span><span>Age</span><span />
            </div>
            {shownActions.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => goProject(a.row.project_id)}
                className={`${ACTION_GRID} min-h-[60px] w-full items-center bg-white px-4 py-2.5 text-left ${ROW_DIVIDER} hover:bg-[rgb(249,250,251)]`}
              >
                <span><Badge color={PRI_BADGE[a.pri]}>{a.pri}</Badge></span>
                <span className="flex min-w-0 flex-col gap-[3px]">
                  <span className="truncate text-[14px] font-medium text-[rgb(13,27,62)]" title={a.title}>{a.title}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-[rgb(84,100,144)]">
                    <Dot color={STAGE_DOT[a.team]} size={6} />
                    <span className="truncate" title={a.evidence}>{a.evidence}</span>
                  </span>
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar name={a.owner} />
                  <span className="flex min-w-0 flex-col gap-px">
                    <span className="truncate text-[13px] font-medium text-[rgb(13,27,62)]">{a.owner}</span>
                    <span className="text-[11px] text-[rgb(138,151,181)]">Owner</span>
                    {a.approver && (
                      <span className="truncate text-[11px] text-[rgb(84,100,144)]" title={a.approver}>
                        Approver · <span className="font-medium text-[rgb(13,27,62)]">{a.approver}</span>
                      </span>
                    )}
                  </span>
                </span>
                <span className="text-[13px] font-medium text-[rgb(13,27,62)]">{a.by}</span>
                <span className="text-[13px] text-[rgb(84,100,144)]">{a.age}</span>
                <span className="flex items-center justify-end gap-0.5 text-[13px] font-semibold text-[rgb(43,43,181)]">
                  Open
                  <ChevronRight className="h-4 w-4" />
                </span>
              </button>
            ))}
            {actionsInCat.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAllActions((s) => !s)}
                className="h-10 w-full bg-white text-[13px] font-semibold text-[rgb(43,43,181)] hover:bg-[rgb(240,240,253)]"
              >
                {showAllActions ? "Show fewer" : `Show all ${actionsInCat.length} actions`}
              </button>
            )}
            {actionsInCat.length === 0 && <Empty>No actions for this signal in the current view.</Empty>}
          </div>
        </div>
        <div className="px-4 py-2.5 text-[12px] leading-4 text-[rgb(84,100,144)] shadow-[inset_0_1px_0_rgb(234,238,244)]">
          Owner is whoever last logged work on the deliverable at its current stage (for review items, the member who marked it ready). Approver is who has to sign off; resolve-by follows the signal&apos;s urgency.
        </div>
      </section>
    </Block>
    </>
  );
}
