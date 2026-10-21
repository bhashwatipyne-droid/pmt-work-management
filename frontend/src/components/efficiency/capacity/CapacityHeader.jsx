import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Target } from "lucide-react";
import { C, hoverBg } from "./capacityTheme";
import { monthLabel, shiftMonth } from "@/components/efficiency/EfficiencyFilters";

export function CapacityHeader(ctx) {
  const { month, navigate, segBtn, setMonth } = ctx;
  return (
    <>
    {/* Header */}
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button
        type="button"
        onClick={() => navigate("/efficiency")}
        style={{
          alignSelf: "flex-start",
          display: "flex",
          alignItems: "center",
          gap: 6,
          height: 28,
          padding: "0 8px",
          marginLeft: -8,
          border: "none",
          borderRadius: 7,
          background: "transparent",
          color: C.n500,
          fontSize: 13,
          cursor: "pointer",
        }}
        {...hoverBg(C.n50, C.n900)}
      >
        <ArrowLeft size={16} />
        Back to Efficiency
      </button>

      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div
          style={{
            flex: "1 1 320px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 600, color: C.n900 }}>
            Monthly capacity
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 14,
              lineHeight: "20px",
              color: C.n500,
              textWrap: "pretty",
              maxWidth: 620,
            }}
          >
            Set working days, leave and hours for each person. Core hours are calculated for you.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Settings"
          style={{ display: "flex", padding: 2, borderRadius: 8, background: C.n100 }}
        >
          {[
            ["Capacity", CalendarDays, true, null],
            ["Activity targets", Target, false, "/efficiency/settings/activity-targets"],
          ].map(([label, Icon, active, to]) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => to && navigate(to)}
              style={{
                height: 30,
                padding: "0 12px",
                border: "none",
                borderRadius: 7,
                ...segBtn(active),
                color: active ? C.n900 : C.n500,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderRadius: 7,
            background: "#fff",
            boxShadow: `inset 0 0 0 1px ${C.n200}`,
          }}
        >
          {[
            ["Previous month", ChevronLeft, -1],
            ["Next month", ChevronRight, 1],
          ].map(([label, Icon, d], i) => (
            <span key={label} style={{ display: "contents" }}>
              {i === 1 && (
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    minWidth: 112,
                    textAlign: "center",
                    color: C.n900,
                  }}
                >
                  {monthLabel(month)}
                </span>
              )}
              <button
                type="button"
                aria-label={label}
                onClick={() => setMonth(shiftMonth(month, d))}
                style={{
                  width: 34,
                  height: 34,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  color: C.n700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon size={16} />
              </button>
            </span>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
