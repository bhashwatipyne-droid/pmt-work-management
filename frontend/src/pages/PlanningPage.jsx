import { useMemo, useState } from "react";
import { Hourglass, MessageSquare, Shuffle, UserPlus, X, Check } from "lucide-react";
import { toast } from "sonner";

import { DEPT_FILTERS, computePlan, initials } from "@/lib/planning/planningLogic";
import {
  dismissInsight,
  reassignTask,
  resetInsights,
  usePlanningStore,
} from "@/services/planningApi";

// Planning: today's and this week's deliverables, what changed, and expected
// efficiency against potential. Markup and spacing follow the design prototype.
// Data comes from services/planningApi.js (sample data until the backend exists).

const INSIGHT_ICONS = {
  shuffle: Shuffle,
  hourglass: Hourglass,
  "user-plus": UserPlus,
  message: MessageSquare,
};

const CARD = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "inset 0 0 0 1px rgb(234,238,244)",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

const segWrap = { display: "flex", padding: 2, borderRadius: 8, background: "var(--neutral-100)" };
const segOn = (on) => (on ? "#fff" : "transparent");
const segSh = (on) => (on ? "0 1px 2px 0 rgba(13,28,61,0.05)" : "none");

const Avatar = ({ text, size, fontSize, style }) => (
  <span
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: 9999,
      background: "var(--brand-50)",
      color: "var(--brand-700)",
      font: `600 ${fontSize}px/${size}px var(--font-ui)`,
      textAlign: "center",
      ...style,
    }}
  >
    {text}
  </span>
);

const SectionHead = ({ title, sub, right }) => (
  <div style={{ padding: "16px 16px 12px", display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
    <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 2 }}>
      <h2 style={{ margin: 0, fontSize: 15, lineHeight: "20px", fontWeight: 600, color: "var(--neutral-900)" }}>{title}</h2>
      <span style={{ fontSize: 12, lineHeight: "16px", color: "var(--neutral-500)", textWrap: "pretty" }}>{sub}</span>
    </div>
    {right}
  </div>
);

const LIST_COLS = "minmax(220px,2fr) 170px minmax(200px,1.5fr) 130px 70px 100px";

export default function PlanningPage() {
  const { tasks, dismissed } = usePlanningStore();
  const [period, setPeriod] = useState("today");
  const [cat, setCat] = useState("all");
  const [dept, setDept] = useState("all");

  const plan = useMemo(
    () => computePlan(tasks, { period, cat, dept, dismissed }),
    [tasks, period, cat, dept, dismissed]
  );
  const week = plan.week;
  const hasDismissed = Object.keys(dismissed).length > 0;

  const runInsight = (n) => {
    if (!n.act) return;
    if (n.act.type === "reassign") {
      reassignTask(n.act.taskId, n.act.to, n.act.from);
      toast.success("“" + n.act.task + "” moved to " + n.act.to);
    } else if (n.act.type === "filterCat") {
      setCat(n.act.cat);
    }
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative", background: "#fff" }}>
      <div
        data-screen-label="Planning"
        data-testid="planning-page"
        style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 72px", display: "flex", flexDirection: "column", gap: 20 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 style={{ margin: 0, font: "var(--type-heading-lg)", color: "var(--neutral-900)" }}>Planning</h1>
          <p style={{ margin: 0, fontSize: 14, color: "var(--neutral-500)", textWrap: "pretty" }}>
            Today’s and this week’s deliverables, what changed, and expected efficiency against potential
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={segWrap}>
            {[
              ["today", "Today"],
              ["week", "This week"],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setPeriod(k)}
                style={{
                  height: 30,
                  padding: "0 14px",
                  border: "none",
                  borderRadius: 7,
                  background: segOn(period === k),
                  boxShadow: segSh(period === k),
                  color: "var(--neutral-900)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--neutral-900)" }}>{plan.periodLabel}</span>
          <span style={{ flex: 1 }} />
          <div style={{ ...segWrap, flexWrap: "wrap" }}>
            {DEPT_FILTERS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDept(d)}
                style={{
                  height: 28,
                  padding: "0 12px",
                  border: "none",
                  borderRadius: 7,
                  background: segOn(dept === d),
                  boxShadow: segSh(dept === d),
                  color: dept === d ? "var(--neutral-900)" : "var(--neutral-500)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {d === "all" ? "All teams" : d}
              </button>
            ))}
          </div>
        </div>

        {/* Summary tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
          {plan.tiles.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={c.sel}
              className="pp-hv-n50"
              onClick={() => setCat(c.sel && c.key !== "all" ? "all" : c.key)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 6,
                padding: 14,
                border: "none",
                borderRadius: 12,
                background: c.sel ? "var(--brand-50)" : "#fff",
                boxShadow: c.sel ? "inset 0 0 0 2px var(--brand-500)" : "inset 0 0 0 1px rgb(234,238,244)",
                textAlign: "left",
                cursor: "pointer",
                transition: "background 120ms ease, box-shadow 120ms ease",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, lineHeight: "16px", fontWeight: 600, color: "var(--neutral-900)" }}>
                <span style={{ width: 8, height: 8, flexShrink: 0, borderRadius: 9999, background: c.dot }} />
                {c.label}
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ font: "var(--type-heading-md)", color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums" }}>{c.n}</span>
                <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>{c.hrs}</span>
              </span>
              <span style={{ fontSize: 12, lineHeight: "16px", color: "var(--neutral-500)", textWrap: "pretty" }}>{c.sub}</span>
            </button>
          ))}
        </div>

        {/* Schedule */}
        <section style={{ ...CARD, overflow: "hidden" }}>
          <SectionHead
            title="Schedule"
            sub="Each bar is a deliverable. Colour shows what changed; the bar on the left is assigned work against potential."
            right={
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                {plan.legend.map((g) => (
                  <span key={g.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--neutral-700)" }}>
                    <span style={{ width: 14, height: 10, borderRadius: 3, background: g.bg, boxShadow: g.ring }} />
                    {g.label}
                  </span>
                ))}
              </div>
            }
          />
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 860 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "230px minmax(0,1fr)",
                  height: 32,
                  alignItems: "center",
                  background: "var(--neutral-50)",
                  boxShadow: "inset 0 1px 0 rgb(234,238,244), inset 0 -1px 0 rgb(234,238,244)",
                }}
              >
                <span style={{ padding: "0 16px", fontSize: 12, fontWeight: 600, color: "var(--neutral-500)" }}>Person · load</span>
                <div style={{ position: "relative", height: "100%" }}>
                  {plan.ticks.map((k) => (
                    <span
                      key={k.label}
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: k.left,
                        display: "flex",
                        alignItems: "center",
                        paddingLeft: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        color: "var(--neutral-500)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {k.label}
                    </span>
                  ))}
                </div>
              </div>

              {plan.rows.map((r) => (
                <div
                  key={r.name}
                  style={{ display: "grid", gridTemplateColumns: "230px minmax(0,1fr)", boxShadow: "inset 0 -1px 0 rgb(243,244,246)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", boxShadow: "inset -1px 0 0 rgb(243,244,246)" }}>
                    <Avatar text={r.ini} size={30} fontSize={11} />
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: "16px", fontWeight: 600, color: "var(--neutral-900)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {r.name}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: r.pctFg, fontVariantNumeric: "tabular-nums" }}>{r.pct}</span>
                      </span>
                      <span style={{ height: 4, borderRadius: 9999, background: "var(--neutral-100)", overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", width: r.barW, background: r.barC, borderRadius: 9999 }} />
                      </span>
                      <span style={{ fontSize: 11, lineHeight: "14px", color: "var(--neutral-500)" }}>{r.loadTxt}</span>
                    </span>
                  </div>
                  <div style={{ position: "relative", height: r.h, minHeight: 56 }}>
                    {week && (
                      <span style={{ position: "absolute", top: 0, bottom: 0, left: plan.todayLeft, width: plan.todayW, background: "var(--brand-50)" }} />
                    )}
                    {plan.ticks.map((k) => (
                      <span key={k.label} style={{ position: "absolute", top: 0, bottom: 0, left: k.left, width: 1, background: "rgb(243,244,246)" }} />
                    ))}
                    {!week && (
                      <span style={{ position: "absolute", top: 0, bottom: 0, left: plan.nowLeft, width: 2, background: "var(--error-500)", zIndex: 2 }} />
                    )}
                    {r.bars.map((b) => (
                      <span
                        key={b.id}
                        title={b.title}
                        style={{
                          position: "absolute",
                          top: b.top,
                          left: b.left,
                          width: b.width,
                          height: 24,
                          boxSizing: "border-box",
                          padding: "0 8px",
                          borderRadius: 6,
                          background: b.bg,
                          boxShadow: b.ring,
                          color: b.fg,
                          opacity: b.op,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          zIndex: 1,
                          transition: "opacity 120ms ease",
                        }}
                      >
                        {b.done && <Check size={12} style={{ flexShrink: 0 }} />}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>
                      </span>
                    ))}
                    {r.away && (
                      <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", paddingLeft: 12, fontSize: 12, color: "var(--neutral-500)" }}>
                        On leave
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Expected efficiency + insights */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,380px),1fr))", gap: 16, alignItems: "start" }}>
          <section style={CARD}>
            <SectionHead
              title="Expected efficiency"
              sub="Assigned work against each person’s potential, weighted by past on-time delivery"
            />
            <div style={{ margin: "0 16px 12px", padding: 14, borderRadius: 10, background: "var(--brand-50)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--brand-700)" }}>Team expected efficiency</span>
                <span style={{ font: "700 32px/40px var(--font-core)", letterSpacing: "-0.02em", color: "var(--brand-700)", fontVariantNumeric: "tabular-nums" }}>
                  {plan.team.exp}
                </span>
              </span>
              <span style={{ flex: 1, minWidth: 160, fontSize: 13, lineHeight: "18px", color: "var(--neutral-700)", textWrap: "pretty" }}>
                {plan.team.assigned} assigned of {plan.team.potential} potential · load {plan.team.load}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 60px 70px", columnGap: 12, padding: "0 16px 6px", fontSize: 12, fontWeight: 600, color: "var(--neutral-500)" }}>
              <span>Person</span>
              <span style={{ textAlign: "right" }}>Load</span>
              <span style={{ textAlign: "right" }}>Expected</span>
            </div>
            {plan.eff.map((e) => (
              <div
                key={e.name}
                style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 60px 70px", columnGap: 12, alignItems: "center", padding: "10px 16px", boxShadow: "inset 0 1px 0 rgb(243,244,246)" }}
              >
                <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-900)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
                    <span style={{ flexShrink: 0, font: "600 11px/16px var(--font-ui)", color: e.tagFg }}>{e.tag}</span>
                  </span>
                  <span style={{ position: "relative", height: 6, borderRadius: 9999, background: "var(--neutral-100)" }}>
                    <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: e.fill, background: e.barC, borderRadius: 9999 }} />
                    <span title="100% of potential" style={{ position: "absolute", left: "80%", top: -3, bottom: -3, width: 2, background: "var(--neutral-900)" }} />
                  </span>
                  <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>
                    {e.meta} · {e.why}
                  </span>
                </span>
                <span style={{ textAlign: "right", fontSize: 14, fontWeight: 600, color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums" }}>{e.load}</span>
                <span style={{ textAlign: "right", fontSize: 14, fontWeight: 600, color: "var(--brand-700)", fontVariantNumeric: "tabular-nums" }}>{e.exp}</span>
              </div>
            ))}
          </section>

          <section style={CARD}>
            <SectionHead
              title="Planning insights"
              sub="Suggestions from qty vs potential, past performance, client feedback and historical delivery data"
              right={
                <span style={{ padding: "2px 8px", borderRadius: 9999, background: "var(--brand-50)", color: "var(--brand-700)", font: "600 11px/16px var(--font-ui)" }}>
                  {plan.insightCount + (plan.insightCount === 1 ? " suggestion" : " suggestions")}
                </span>
              }
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 16px 16px" }}>
              {plan.insights.map((n) => {
                const Icon = INSIGHT_ICONS[n.icon] || Shuffle;
                return (
                  <div key={n.key} style={{ display: "flex", gap: 12, padding: 14, borderRadius: 10, boxShadow: "inset 0 0 0 1px rgb(234,238,244)" }}>
                    <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: n.tone, color: n.toneFg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon size={16} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                      <span style={{ fontSize: 14, lineHeight: "18px", fontWeight: 600, color: "var(--neutral-900)", textWrap: "pretty" }}>{n.title}</span>
                      <span style={{ fontSize: 13, lineHeight: "18px", color: "var(--neutral-700)", textWrap: "pretty" }}>{n.body}</span>
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {n.factors.map((f) => (
                          <span key={f} style={{ padding: "2px 8px", borderRadius: 9999, background: "var(--neutral-50)", boxShadow: "inset 0 0 0 1px rgb(234,238,244)", color: "var(--neutral-700)", font: "500 11px/16px var(--font-ui)" }}>
                            {f}
                          </span>
                        ))}
                      </span>
                      <span style={{ display: "flex", gap: 8, marginTop: 2 }}>
                        {n.act && (
                          <button
                            type="button"
                            className="pp-hv-b400"
                            onClick={() => runInsight(n)}
                            style={{ height: 30, padding: "0 12px", border: "none", borderRadius: 7, background: "var(--brand-500)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                          >
                            {n.action}
                          </button>
                        )}
                        <button
                          type="button"
                          className="pp-hv-n50"
                          onClick={() => dismissInsight(n.key)}
                          style={{ height: 30, padding: "0 12px", border: "none", borderRadius: 7, background: "transparent", color: "var(--neutral-700)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          Dismiss
                        </button>
                      </span>
                    </div>
                  </div>
                );
              })}
              {plan.insightCount === 0 && (
                <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 13, color: "var(--neutral-500)" }}>
                  No suggestions for this view. The plan looks balanced.
                </div>
              )}
              {hasDismissed && (
                <button
                  type="button"
                  className="pp-hv-b50"
                  onClick={resetInsights}
                  style={{ alignSelf: "flex-start", height: 28, padding: "0 8px", border: "none", borderRadius: 7, background: "transparent", color: "var(--brand-500)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Show dismissed
                </button>
              )}
            </div>
          </section>
        </div>

        {/* Task list */}
        <section style={{ ...CARD, overflow: "hidden" }}>
          <SectionHead
            title={plan.listTitle}
            sub={plan.periodLabel + " · pick a card above to filter"}
            right={
              cat !== "all" && (
                <button
                  type="button"
                  className="pp-hv-n50"
                  onClick={() => setCat("all")}
                  style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", border: "none", borderRadius: 7, background: "#fff", boxShadow: "inset 0 0 0 1px var(--neutral-200)", color: "var(--neutral-700)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  <X size={14} />
                  Clear filter
                </button>
              )
            }
          />
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 860 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: LIST_COLS,
                  columnGap: 12,
                  alignItems: "center",
                  height: 36,
                  padding: "0 16px",
                  background: "var(--neutral-50)",
                  boxShadow: "inset 0 1px 0 rgb(234,238,244), inset 0 -1px 0 rgb(234,238,244)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--neutral-500)",
                }}
              >
                <span>Deliverable</span>
                <span>Assignee</span>
                <span>What changed</span>
                <span>When</span>
                <span style={{ textAlign: "right" }}>Hours</span>
                <span>Status</span>
              </div>
              {plan.list.map((t) => (
                <div
                  key={t.id}
                  style={{ display: "grid", gridTemplateColumns: LIST_COLS, columnGap: 12, alignItems: "center", minHeight: 56, padding: "6px 16px", boxSizing: "border-box", boxShadow: "inset 0 -1px 0 rgb(243,244,246)" }}
                >
                  <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 14, lineHeight: "18px", fontWeight: 500, color: "var(--neutral-900)", textWrap: "pretty" }}>{t.task}</span>
                    <span style={{ fontSize: 12, color: "var(--neutral-500)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.proj}</span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Avatar text={initials(t.who)} size={26} fontSize={10} />
                    <span style={{ fontSize: 13, color: "var(--neutral-900)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.who}</span>
                  </span>
                  <span style={{ minWidth: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                    <span style={{ padding: "2px 8px", borderRadius: 9999, background: t.tagBg, color: t.tagFg, font: "600 11px/16px var(--font-ui)", whiteSpace: "nowrap" }}>{t.tag}</span>
                    <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>{t.note}</span>
                  </span>
                  <span style={{ fontSize: 13, color: "var(--neutral-700)", fontVariantNumeric: "tabular-nums" }}>{t.when}</span>
                  <span style={{ textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums" }}>{t.hrs}</span>
                  <span>
                    <span style={{ padding: "2px 8px", borderRadius: 9999, background: t.stBg, color: t.stFg, font: "600 11px/16px var(--font-ui)", whiteSpace: "nowrap" }}>{t.st}</span>
                  </span>
                </div>
              ))}
              {plan.list.length === 0 && (
                <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "var(--neutral-500)" }}>
                  Nothing in this group for the selected period and team.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
