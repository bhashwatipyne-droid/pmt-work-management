import { AlertCircle, Clock, Info, Pencil, Search, Target, Trash2 } from "lucide-react";
import { C, GRID, cardStyle, fmtN, focusRing, hoverBg, initials, segBtn } from "@/components/efficiency/targets/targetsTheme";
import { monthLabel } from "@/components/efficiency/EfficiencyFilters";

export function TargetsEditor(ctx) {
  const { busy, capCalc, clear, commitMin, month, navigate, selectedRow, setDrafts, setN, setTgtFilter, setTgtQ, tgtFilter, tgtQ, toggle, total, visible } = ctx;
  return (
    <>
    {/* Targets */}
    <section style={{ ...cardStyle, flex: "999 1 560px", minWidth: 0, maxHeight: "100%", minHeight: 420 }}>
      {!selectedRow ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40, fontSize: 13, color: C.n500 }}>
          Select a team member to configure their targets.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", boxShadow: `inset 0 -1px 0 ${C.lineSoft}`, flexWrap: "wrap" }}>
            <span style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 9999, background: C.brand50, color: C.brand700, fontSize: 14, lineHeight: "40px", fontWeight: 600, textAlign: "center" }}>
              {initials(selectedRow.name)}
            </span>
            <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 2 }}>
              <h2 style={{ margin: 0, fontSize: 20, lineHeight: "24px", fontWeight: 600, color: C.n900 }}>{selectedRow.name}</h2>
              <span style={{ fontSize: 13, color: C.n500 }}>
                {selectedRow.department || "—"} · {monthLabel(month)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate("/efficiency/settings/monthly-capacity")}
              title="Edit capacity"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 32,
                padding: "0 12px",
                border: "none",
                borderRadius: 9999,
                background: C.n50,
                boxShadow: `inset 0 0 0 1px ${C.line}`,
                color: C.n700,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
              {...hoverBg(C.brand50, C.brand700)}
            >
              <Clock size={14} />
              {capCalc ? `${fmtN(capCalc.core, 1)}h core · ${fmtN(capCalc.hpd, 1)}h per day` : "Capacity not set"}
              <Pencil size={12} />
            </button>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
            {!capCalc && (
              <div style={{ margin: "16px 20px 0", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: C.warning100, color: C.warningFg, fontSize: 13 }}>
                <AlertCircle size={16} />
                <span style={{ flex: 1 }}>Capacity isn't set for this month, so potential can't be calculated yet.</span>
                <button
                  type="button"
                  onClick={() => navigate("/efficiency/settings/monthly-capacity")}
                  style={{ height: 28, padding: "0 10px", border: "none", borderRadius: 7, background: "#fff", color: C.warningFg, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Set capacity
                </button>
              </div>
            )}

            <div style={{ padding: "14px 20px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span style={{ flex: "1 1 220px", position: "relative", display: "flex", alignItems: "center" }}>
                <Search size={14} style={{ position: "absolute", left: 10, color: C.n400, pointerEvents: "none" }} />
                <input
                  aria-label="Search activities"
                  value={tgtQ}
                  onChange={(e) => setTgtQ(e.target.value)}
                  placeholder="Search activities"
                  onFocus={(e) => focusRing(e, true)}
                  onBlur={(e) => focusRing(e, false)}
                  style={{ width: "100%", minWidth: 0, height: 34, boxSizing: "border-box", padding: "0 10px 0 32px", border: "none", borderRadius: 7, background: "#fff", boxShadow: `inset 0 0 0 1px ${C.n200}`, fontSize: 13, lineHeight: "18px", color: C.n900, outline: "none" }}
                />
              </span>
              <div style={{ display: "flex", padding: 2, borderRadius: 8, background: C.n100 }}>
                {[
                  ["all", "All"],
                  ["set", `Set · ${setN}`],
                  ["notset", `Not set · ${total - setN}`],
                ].map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTgtFilter(k)}
                    style={{ height: 28, padding: "0 12px", border: "none", borderRadius: 7, ...segBtn(tgtFilter === k), color: C.n900, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 640 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: GRID,
                    columnGap: 12,
                    alignItems: "center",
                    height: 36,
                    padding: "0 20px",
                    fontSize: 12,
                    fontWeight: 600,
                    color: C.n500,
                    background: C.n50,
                    boxShadow: `inset 0 1px 0 ${C.line},inset 0 -1px 0 ${C.line}`,
                  }}
                >
                  <span>
                    Activity · {setN} of {total} set
                  </span>
                  <span>Minutes per unit</span>
                  <span style={{ textAlign: "right" }}>Per day</span>
                  <span style={{ textAlign: "right" }}>Per month</span>
                  <span>Status</span>
                  <span />
                </div>

                {visible.map((r) => {
                  const op = r.set && !r.on ? 0.5 : 1;
                  return (
                    <div
                      key={r.act}
                      style={{
                        display: "grid",
                        gridTemplateColumns: GRID,
                        columnGap: 12,
                        alignItems: "center",
                        minHeight: 56,
                        padding: "0 20px",
                        background: r.set ? "transparent" : C.n50,
                        boxShadow: `inset 0 -1px 0 ${C.lineSoft}`,
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, opacity: op }}>
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            flexShrink: 0,
                            borderRadius: 8,
                            background: r.set ? C.brand50 : C.n100,
                            color: r.set ? C.brand500 : C.n400,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Target size={14} />
                        </span>
                        <span style={{ fontSize: 14, lineHeight: "18px", fontWeight: 500, color: C.n900, textWrap: "pretty" }}>{r.act}</span>
                      </span>
                      <span style={{ position: "relative", display: "flex", alignItems: "center" }}>
                        <input
                          aria-label={`Minutes per unit for ${r.act}`}
                          inputMode="numeric"
                          value={r.min}
                          disabled={busy === r.act}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9]/g, "");
                            setDrafts((d) => ({ ...d, [r.act]: v }));
                          }}
                          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          onFocus={(e) => focusRing(e, true)}
                          onBlur={(e) => {
                            focusRing(e, false);
                            commitMin(r);
                          }}
                          placeholder="Enter"
                          style={{
                            width: "100%",
                            minWidth: 0,
                            height: 32,
                            boxSizing: "border-box",
                            padding: "0 38px 0 10px",
                            border: "none",
                            borderRadius: 7,
                            background: "#fff",
                            boxShadow: `inset 0 0 0 1px ${C.n200}`,
                            fontSize: 14,
                            lineHeight: "18px",
                            color: C.n900,
                            outline: "none",
                            fontWeight: 600,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        />
                        <span style={{ position: "absolute", right: 10, fontSize: 12, color: C.n500, pointerEvents: "none" }}>min</span>
                      </span>
                      <span style={{ textAlign: "right", fontSize: 16, fontWeight: 600, color: C.n900, fontVariantNumeric: "tabular-nums", opacity: op }}>{r.p.d}</span>
                      <span style={{ textAlign: "right", fontSize: 14, color: C.n700, fontVariantNumeric: "tabular-nums", opacity: op }}>{r.p.m}</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={r.on}
                        onClick={() => toggle(r)}
                        disabled={busy === r.act}
                        style={{
                          opacity: r.set ? 1 : 0.4,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          height: 32,
                          padding: 0,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 500,
                          color: C.n700,
                        }}
                      >
                        <span style={{ position: "relative", width: 32, height: 18, flexShrink: 0, borderRadius: 62, background: r.on ? C.brand500 : C.n300, transition: "background 120ms ease" }}>
                          <span style={{ position: "absolute", top: 2, left: r.on ? 16 : 2, width: 14, height: 14, borderRadius: 9999, background: "#fff", boxShadow: "0 1px 2px rgba(13,28,61,0.15)" }} />
                        </span>
                        {!r.set ? "Not set" : r.on ? "Active" : "Paused"}
                      </button>
                      <button
                        type="button"
                        onClick={() => clear(r)}
                        aria-label={`Clear ${r.act}`}
                        title="Clear minutes"
                        style={{ width: 32, height: 32, border: "none", borderRadius: 7, background: "transparent", color: C.n400, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        {...hoverBg(C.error50, C.error500)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {visible.length === 0 && (
              <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: C.n900 }}>No matching activities</span>
                <span style={{ fontSize: 13, color: C.n500 }}>Try a different search or filter.</span>
              </div>
            )}

            <div style={{ padding: "14px 20px", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.n500 }}>
              <Info size={14} style={{ flexShrink: 0 }} />
              Type minutes next to any activity to set it. Per day = hours per day ÷ minutes. Per month = core hours ÷ minutes. Changes save automatically.
            </div>
          </div>
        </>
      )}
    </section>
    </>
  );
}
