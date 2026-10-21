import { C, cardStyle, focusRing, hoverBg, initials } from "./capacityTheme";
import { Search } from "lucide-react";

export function CapacityTeamList(ctx) {
  const { dirty, employeeId, employees, filter, filteredEmployees, isSet, missingCount, search, segBtn, setEmployeeId, setFilter, setN, setPct, setSearch } = ctx;
  return (
    <>
    {/* Team list */}
    <aside
      style={{
        ...cardStyle,
        flex: "1 1 280px",
        maxWidth: "100%",
        minWidth: 240,
        maxHeight: "100%",
        minHeight: 280,
      }}
    >
      <div style={{ padding: "14px 14px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.n900 }}>Team</span>
          <span style={{ fontSize: 12, color: C.n500 }}>
            {setN} of {employees.length} set
          </span>
        </div>
        <div style={{ height: 4, borderRadius: 9999, background: C.n100, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${setPct}%`,
              background: C.success500,
              borderRadius: 9999,
            }}
          />
        </div>
        <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
          <Search
            size={14}
            style={{ position: "absolute", left: 10, color: C.n400, pointerEvents: "none" }}
          />
          <input
            aria-label="Search team"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            onFocus={(e) => focusRing(e, true)}
            onBlur={(e) => focusRing(e, false)}
            style={{
              width: "100%",
              minWidth: 0,
              height: 34,
              boxSizing: "border-box",
              padding: "0 10px 0 32px",
              border: "none",
              borderRadius: 7,
              background: "#fff",
              boxShadow: `inset 0 0 0 1px ${C.n200}`,
              fontSize: 13,
              lineHeight: "18px",
              color: C.n900,
              outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", padding: 2, borderRadius: 8, background: C.n100 }}>
          {[
            ["all", "All"],
            ["notset", `Not set · ${missingCount}`],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              title={k === "notset" ? "Capacity not set" : undefined}
              style={{
                flex: 1,
                whiteSpace: "nowrap",
                height: 28,
                border: "none",
                borderRadius: 7,
                ...segBtn(filter === k),
                color: C.n900,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        role="listbox"
        aria-label="Team members"
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: "4px 8px 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          boxShadow: `inset 0 1px 0 ${C.lineSoft}`,
        }}
      >
        {filteredEmployees.map((e) => {
          const on = e.user_id === employeeId;
          const set = isSet(e.user_id);
          const pill =
            on && dirty
              ? ["Unsaved", C.brand50, C.brand700]
              : set
                ? ["Set", C.success100, C.successFg]
                : ["Not set", C.warning100, C.warningFg];
          return (
            <button
              key={e.user_id}
              type="button"
              role="option"
              aria-selected={on}
              onClick={() => setEmployeeId(e.user_id)}
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 10,
                minHeight: 52,
                padding: "8px 10px",
                border: "none",
                borderRadius: 8,
                background: on ? C.brand50 : "transparent",
                boxShadow: on ? `inset 0 0 0 2px ${C.brand500}` : "none",
                textAlign: "left",
                cursor: "pointer",
                transition: "background 120ms ease",
              }}
              {...(on ? {} : hoverBg(C.n50))}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  flexShrink: 0,
                  borderRadius: 9999,
                  background: C.brand50,
                  color: C.brand700,
                  fontSize: 12,
                  lineHeight: "32px",
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                {initials(e.name)}
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    lineHeight: "18px",
                    fontWeight: on ? 600 : 500,
                    color: C.n900,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {e.name}
                </span>
                <span style={{ fontSize: 12, lineHeight: "16px", color: C.n500 }}>
                  {e.department || "—"}
                </span>
              </span>
              <span
                style={{
                  flexShrink: 0,
                  padding: "2px 8px",
                  borderRadius: 9999,
                  background: pill[1],
                  color: pill[2],
                  fontSize: 11,
                  lineHeight: "16px",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {pill[0]}
              </span>
            </button>
          );
        })}
        {filteredEmployees.length === 0 && (
          <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 13, color: C.n500 }}>
            No one matches. Everyone may already be set.
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
