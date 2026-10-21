import { AlertCircle, ChevronRight, Copy, Loader2, Plus } from "lucide-react";
import { C, cardStyle, fmtN, focusRing, hoverBg, initials, stepBtnStyle } from "./capacityTheme";
import { monthLabel } from "@/components/efficiency/EfficiencyFilters";

export function CapacityEditor(ctx) {
  const { breakdown, btnOpacity, bump, copyPrev, coreDays, coreHours, dirty, fields, form, hasValues, hpd, leaveErr, month, prevMonthName, save, savedForm, saving, selectedRow, setField, setForm, status } = ctx;
  return (
    <>
    {/* Editor */}
    <section
      style={{
        ...cardStyle,
        flex: "999 1 560px",
        minWidth: 0,
        maxHeight: "100%",
        minHeight: 420,
      }}
    >
      {!selectedRow ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 40,
            fontSize: 13,
            color: C.n500,
          }}
        >
          Select a team member to configure their capacity.
        </div>
      ) : (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "16px 20px",
              boxShadow: `inset 0 -1px 0 ${C.lineSoft}`,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                flexShrink: 0,
                borderRadius: 9999,
                background: C.brand50,
                color: C.brand700,
                fontSize: 14,
                lineHeight: "40px",
                fontWeight: 600,
                textAlign: "center",
              }}
            >
              {initials(selectedRow.name)}
            </span>
            <div
              style={{
                flex: 1,
                minWidth: 160,
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 20, lineHeight: "24px", fontWeight: 600, color: C.n900 }}>
                {selectedRow.name}
              </h2>
              <span style={{ fontSize: 13, color: C.n500 }}>
                {selectedRow.department || "—"} · {monthLabel(month)}
              </span>
            </div>
            <button
              type="button"
              onClick={copyPrev}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 32,
                padding: "0 12px",
                border: "none",
                borderRadius: 7,
                background: "#fff",
                boxShadow: `inset 0 0 0 1px ${C.n200}`,
                color: C.n900,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
              {...hoverBg(C.n50)}
            >
              <Copy size={14} />
              Copy from {prevMonthName}
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: "auto",
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 24,
            }}
          >
            {/* 1. Inputs */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.n900 }}>1. Inputs</h3>
                <span style={{ fontSize: 12, color: C.n500 }}>Only these three need entering</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,180px),1fr))",
                  gap: 12,
                }}
              >
                {fields.map(([k, label, help, step, mn, mx, Icon, placeholder]) => (
                  <label
                    key={k}
                    style={{
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      padding: 14,
                      borderRadius: 10,
                      background: C.n50,
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        color: C.n900,
                      }}
                    >
                      <Icon size={14} style={{ color: C.brand500 }} />
                      {label}
                    </span>
                    <span style={{ display: "flex", gap: 6, minWidth: 0 }}>
                      <button
                        type="button"
                        aria-label={`Decrease ${label}`}
                        onClick={bump(k, -step, mn, mx)}
                        style={stepBtnStyle}
                        {...hoverBg(C.n100)}
                      >
                        <span style={{ width: 10, height: 2, borderRadius: 1, background: "currentColor" }} />
                      </button>
                      <input
                        inputMode="decimal"
                        value={form[k]}
                        onChange={(e) => setField(k, e.target.value.replace(/[^0-9.]/g, ""))}
                        placeholder={placeholder}
                        onFocus={(e) => focusRing(e, true)}
                        onBlur={(e) => focusRing(e, false)}
                        data-testid={`capacity-${k === "wd" ? "working-days" : k === "lv" ? "leave-days" : "hours-per-day"}`}
                        style={{
                          width: "100%",
                          minWidth: 0,
                          height: 36,
                          boxSizing: "border-box",
                          padding: "0 10px",
                          border: "none",
                          borderRadius: 7,
                          background: "#fff",
                          boxShadow: `inset 0 0 0 1px ${C.n200}`,
                          lineHeight: "18px",
                          color: C.n900,
                          outline: "none",
                          textAlign: "center",
                          fontSize: 16,
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${label}`}
                        onClick={bump(k, step, mn, mx)}
                        style={stepBtnStyle}
                        {...hoverBg(C.n100)}
                      >
                        <Plus size={16} />
                      </button>
                    </span>
                    <span style={{ fontSize: 12, lineHeight: "16px", color: C.n500 }}>{help}</span>
                  </label>
                ))}
              </div>
              {leaveErr && (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    color: C.error500,
                  }}
                >
                  <AlertCircle size={14} />
                  Leave days cannot be more than working days.
                </span>
              )}
            </div>

            {/* 2. Calculated capacity */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.n900 }}>
                  2. Calculated capacity
                </h3>
                <span style={{ fontSize: 12, color: C.n500 }}>Read-only · updates as you type</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))",
                  gap: 16,
                  alignItems: "stretch",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    gap: 6,
                    padding: 20,
                    borderRadius: 12,
                    background: C.brand50,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 500, color: C.brand700 }}>
                    Core hours this month
                  </span>
                  <span
                    style={{
                      fontSize: 40,
                      lineHeight: "48px",
                      fontWeight: 700,
                      letterSpacing: "-0.02em",
                      color: C.brand700,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {hasValues ? `${fmtN(coreHours, 1)}h` : "–"}
                  </span>
                  <span style={{ fontSize: 13, color: C.n700 }}>
                    {hasValues
                      ? `${fmtN(coreDays)} core days · ${fmtN(hpd, 1)}h per day`
                      : "Enter the inputs to calculate"}
                  </span>
                </div>
                <div
                  style={{
                    borderRadius: 12,
                    boxShadow: `inset 0 0 0 1px ${C.line}`,
                    overflow: "hidden",
                  }}
                >
                  {breakdown.map(([label, how, val, strong], i) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        minHeight: 44,
                        padding: "0 14px",
                        background: strong ? C.brand50 : "transparent",
                        boxShadow: i ? `inset 0 1px 0 ${C.lineSoft}` : "none",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: "flex",
                          flexDirection: "column",
                          gap: 1,
                          padding: "6px 0",
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: strong ? 600 : 500, color: C.n900 }}>
                          {label}
                        </span>
                        <span style={{ fontSize: 12, color: C.n500 }}>{how}</span>
                      </span>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: strong ? C.brand700 : C.n900,
                          fontVariantNumeric: "tabular-nums",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {val}
                      </span>
                    </div>
                  ))}
                  {!hasValues && (
                    <div
                      style={{
                        padding: "24px 14px",
                        textAlign: "center",
                        fontSize: 13,
                        color: C.n500,
                      }}
                    >
                      Enter working days, leave and hours to see the breakdown.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              minHeight: 60,
              padding: "0 20px",
              boxShadow: `inset 0 1px 0 ${C.line}`,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                flex: 1,
                minWidth: 160,
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 500,
                color: status[1],
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 9999, background: status[2] }} />
              {status[0]}
            </span>
            {dirty && (
              <button
                type="button"
                onClick={() => setForm(savedForm)}
                style={{
                  height: 34,
                  padding: "0 14px",
                  border: "none",
                  borderRadius: 7,
                  background: "transparent",
                  color: C.n700,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
                {...hoverBg(C.n50)}
              >
                Discard
              </button>
            )}
            <button
              type="button"
              onClick={() => save(true)}
              disabled={saving}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 34,
                padding: "0 14px",
                border: "none",
                borderRadius: 7,
                background: C.brand100,
                color: C.brand700,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                opacity: btnOpacity,
              }}
            >
              Save &amp; next
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => save(false)}
              disabled={saving}
              data-testid="capacity-save"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                height: 34,
                padding: "0 16px",
                border: "none",
                borderRadius: 7,
                background: C.brand500,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                opacity: btnOpacity,
              }}
              {...hoverBg(C.brand400)}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save capacity
            </button>
          </div>
        </>
      )}
    </section>
    </>
  );
}
