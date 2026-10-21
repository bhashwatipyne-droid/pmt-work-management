import { ArrowRight } from "lucide-react";
import { Block, Empty, Pill, SectionHead, StatTile } from "./dashboardParts";
import { C, CARD, HAIRLINE, LINK_BTN } from "./dashboardTheme";
import { monthShort } from "@/lib/homeDashboard";

export function TrendsTab(ctx) {
  const { capacity, navigate, openActions, prevShort, quality, trend, trends } = ctx;
  return (
    <>
    <>
      <Block title="Are we improving or getting worse?">
        <section className={`${CARD} flex flex-col`}>
          <SectionHead title="Six-month management trend" sub="Direction matters more than a single month. Current month in solid blue." />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 px-4 pb-4">
            {trends.map((t) => {
              const vals = t.vals;
              const now = vals[vals.length - 1];
              const before = vals[vals.length - 2];
              const delta = now != null && before != null ? now - before : null;
              const better = delta == null ? true : t.good === "up" ? delta >= 0 : delta <= 0;
              const max = Math.max(1, ...vals.filter((v) => v != null));
              return (
                <div key={t.label} className={`flex flex-col gap-2.5 rounded-[10px] p-3.5 ${HAIRLINE}`}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-medium text-[rgb(74,88,120)]">{t.label}</span>
                    <span className="text-[11px] text-[rgb(138,151,181)]">{t.good === "up" ? "Higher is better" : "Lower is better"}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-2xl font-semibold leading-8 text-[rgb(13,27,62)]">{now != null ? `${now}${t.unit}` : "—"}</span>
                    {delta != null && (
                      <Pill bg={better ? C.success100 : C.error50} fg={better ? C.successText : C.error500}>
                        {delta > 0 ? "+" : ""}{delta} pts vs {prevShort}
                      </Pill>
                    )}
                  </span>
                  <div className="flex h-14 items-end gap-1.5">
                    {vals.map((v, i) => (
                      <span key={trend[i]?.month || i} title={`${monthShort(trend[i].month)} · ${v != null ? `${v}${t.unit}` : "no data"}`} className="flex h-full flex-1 items-end">
                        <span
                          className="w-full rounded-[4px_4px_2px_2px]"
                          style={{
                            height: v != null ? `${Math.round((v / max) * 100)}%` : 0,
                            background: i === vals.length - 1 ? C.brand500 : C.brand100,
                          }}
                        />
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    {trend.map((m) => (
                      <span key={m.month} className="flex-1 text-center text-[11px] text-[rgb(138,151,181)]">{monthShort(m.month)}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </Block>

      <Block title="What does the operational context say?">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-4">
          <section className={`${CARD} flex flex-col`}>
            <SectionHead title="Capacity context" sub="Current operating capacity for this view.">
              <button type="button" onClick={() => navigate("/efficiency")} className={LINK_BTN}>
                Team &amp; productivity
                <ArrowRight className="h-4 w-4" />
              </button>
            </SectionHead>
            {capacity ? (
              <div className="grid grid-cols-2 gap-2.5 px-4 pb-4">
                {capacity.map((m) => (
                  <StatTile key={m.label} {...m} rounded="rounded-[10px]" pad="px-3.5 py-3" subSize="text-[12px]" />
                ))}
              </div>
            ) : (
              <Empty>Capacity isn&apos;t available for this month.</Empty>
            )}
          </section>
          <section className={`${CARD} flex flex-col`}>
            <SectionHead title="Quality & data trust" sub="Exception signals not already shown in the trend.">
              <div className="flex flex-wrap gap-0.5">
                <button type="button" onClick={() => openActions("rev")} className={LINK_BTN}>
                  Quality &amp; rework
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => navigate("/efficiency")} className={LINK_BTN}>
                  PMT usage
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </SectionHead>
            <div className="grid grid-cols-2 gap-2.5 px-4 pb-4">
              {quality.map((m) => (
                <StatTile key={m.label} {...m} rounded="rounded-[10px]" pad="px-3.5 py-3" subSize="text-[12px]" />
              ))}
            </div>
          </section>
        </div>
      </Block>
    </>
    </>
  );
}
