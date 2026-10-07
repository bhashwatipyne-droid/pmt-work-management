import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Target,
  Clock,
  Pencil,
  Trash2,
  Info,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  getActivityCatalog,
  getEfficiencyOverview,
  getEmployeeTargets,
  getMonthlyCapacityList,
  upsertEmployeeTarget,
  updateEmployeeTarget,
  deleteEmployeeTarget,
} from "@/services/api";

import { currentMonth, monthLabel, shiftMonth } from "@/components/efficiency/EfficiencyFilters";
import { SettingsTableSkeleton } from "@/components/skeletons/Skeletons";

// Mint design-system tokens used by the redesign prototype.
const C = {
  brand50: "rgb(240,240,253)",
  brand100: "rgb(220,220,248)",
  brand500: "rgb(43,43,181)",
  brand700: "rgb(26,26,138)",
  n50: "rgb(249,250,251)",
  n100: "rgb(245,246,248)",
  n200: "rgb(239,240,242)",
  n300: "rgb(209,213,219)",
  n400: "rgb(138,151,181)",
  n500: "rgb(84,100,144)",
  n700: "rgb(74,88,120)",
  n900: "rgb(13,27,62)",
  line: "rgb(234,238,244)",
  lineSoft: "rgb(243,244,246)",
  success500: "rgb(16,185,129)",
  warning100: "rgb(254,243,199)",
  warningFg: "rgb(146,64,14)",
  error50: "rgb(255,245,245)",
  error500: "rgb(239,68,68)",
};

const SEG_SHADOW = "0 1px 2px 0 rgba(13,28,61,0.05)";
const GRID = "minmax(180px,1fr) 120px 80px 90px 100px 32px";

const fmtN = (v, d = 2) =>
  (Number(v) || 0).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });

const initials = (name = "") =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("") || "?";

const cardStyle = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: `inset 0 0 0 1px ${C.line}`,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const focusRing = (e, on) => {
  e.currentTarget.style.boxShadow = on
    ? `inset 0 0 0 1px ${C.brand500},0 0 0 3px ${C.brand100}`
    : `inset 0 0 0 1px ${C.n200}`;
};

const hoverBg = (bg, fg) => ({
  onMouseEnter: (e) => {
    e.currentTarget.dataset.bg = e.currentTarget.style.background;
    e.currentTarget.dataset.fg = e.currentTarget.style.color;
    e.currentTarget.style.background = bg;
    if (fg) e.currentTarget.style.color = fg;
  },
  onMouseLeave: (e) => {
    e.currentTarget.style.background = e.currentTarget.dataset.bg;
    if (fg) e.currentTarget.style.color = e.currentTarget.dataset.fg;
  },
});

const segBtn = (active) => ({
  background: active ? "#fff" : "transparent",
  boxShadow: active ? SEG_SHADOW : "none",
});

export default function EfficiencyActivityTargetsPage() {
  const navigate = useNavigate();
  const { currentUser, loading: userLoading } = useUser();
  const isManager = currentUser?.role === "manager";

  const [month, setMonth] = useState(currentMonth());
  const [employees, setEmployees] = useState([]);
  const [capacities, setCapacities] = useState([]);
  const [counts, setCounts] = useState({});
  const [employeeId, setEmployeeId] = useState("");
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [targets, setTargets] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [tgtQ, setTgtQ] = useState("");
  const [tgtFilter, setTgtFilter] = useState("all");

  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [busy, setBusy] = useState(null);

  // Employees this manager can set potential for: their own department (the
  // API enforces the same rule on save).
  useEffect(() => {
    if (!isManager) {
      setLoadingEmployees(false);
      return;
    }
    let cancelled = false;
    Promise.all([getEfficiencyOverview(month), getActivityCatalog(), getMonthlyCapacityList({ month })])
      .then(([overview, activityCatalog, caps]) => {
        if (cancelled) return;
        const mine = (overview.employees || []).filter(
          (e) => e.department === currentUser?.department
        );
        setEmployees(mine);
        setCatalog(activityCatalog || []);
        setCapacities(caps || []);
        setEmployeeId((prev) => prev || mine[0]?.user_id || "");
        // Per-person "N of M" pills need each person's target count.
        Promise.all(
          mine.map((e) =>
            getEmployeeTargets(e.user_id, month)
              .then((t) => [e.user_id, (t || []).length])
              .catch(() => [e.user_id, 0])
          )
        ).then((pairs) => !cancelled && setCounts(Object.fromEntries(pairs)));
      })
      .catch(() => !cancelled && toast.error("Could not load your team"))
      .finally(() => !cancelled && setLoadingEmployees(false));
    return () => {
      cancelled = true;
    };
  }, [isManager, month, currentUser?.department]);

  const loadTargets = useCallback(() => {
    if (!employeeId) return;
    getEmployeeTargets(employeeId, month)
      .then((t) => {
        setTargets(t || []);
        setDrafts({});
        setCounts((c) => ({ ...c, [employeeId]: (t || []).length }));
      })
      .catch(() => toast.error("Could not load potential for this employee"));
  }, [employeeId, month]);

  useEffect(() => loadTargets(), [loadTargets]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? employees.filter((e) => e.name?.toLowerCase().includes(q)) : employees;
  }, [employees, search]);

  const selectedRow = employees.find((e) => e.user_id === employeeId);
  const cap = capacities.find((c) => c.user_id === employeeId);
  const capCalc = useMemo(() => {
    if (!cap) return null;
    const hpd = Number(cap.working_hours_per_day) || 0;
    const days = Math.max(0, (Number(cap.working_days) || 0) - (Number(cap.leave_days) || 0));
    const core = Math.max(0, days * hpd - (selectedRow?.non_core_hours || 0));
    return { hpd, core };
  }, [cap, selectedRow]);

  const per = (min) =>
    capCalc && capCalc.hpd && min > 0
      ? { d: fmtN((capCalc.hpd * 60) / min), m: fmtN((capCalc.core * 60) / min, 1) }
      : { d: "–", m: "–" };

  const rows = catalog.map((act) => {
    const t = targets.find((x) => x.activity_name === act);
    const min = drafts[act] ?? (t ? String(t.time_per_unit_minutes ?? "") : "");
    const set = !!(t && Number(t.time_per_unit_minutes) > 0);
    const on = set && t.active;
    return { act, t, set, on, min, p: set ? per(Number(t.time_per_unit_minutes)) : { d: "–", m: "–" } };
  });
  const setN = rows.filter((r) => r.set).length;
  const tq = tgtQ.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (!tq || r.act.toLowerCase().includes(tq)) &&
      (tgtFilter === "all" || (tgtFilter === "set" ? r.set : !r.set))
  );

  const commitMin = async (r) => {
    const raw = drafts[r.act];
    if (raw === undefined) return;
    const val = Number(raw || 0);
    if (r.t && val === Number(r.t.time_per_unit_minutes)) {
      setDrafts(({ [r.act]: _, ...rest }) => rest);
      return;
    }
    setBusy(r.act);
    try {
      if (!raw || val <= 0) {
        if (r.t) await deleteEmployeeTarget(r.t.id);
      } else if (r.t) {
        await updateEmployeeTarget(r.t.id, { time_per_unit_minutes: val });
      } else {
        await upsertEmployeeTarget({
          user_id: employeeId,
          activity_name: r.act,
          time_per_unit_minutes: val,
          active: true,
        });
      }
      loadTargets();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save target");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (r) => {
    if (!r.set) return toast.message("Enter minutes first");
    setBusy(r.act);
    try {
      await updateEmployeeTarget(r.t.id, { active: !r.t.active });
      loadTargets();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not update target");
    } finally {
      setBusy(null);
    }
  };

  const clear = async (r) => {
    if (!r.t) {
      setDrafts(({ [r.act]: _, ...rest }) => rest);
      return;
    }
    setBusy(r.act);
    try {
      await deleteEmployeeTarget(r.t.id);
      toast.success(`${r.act} cleared`);
      loadTargets();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not clear target");
    } finally {
      setBusy(null);
    }
  };

  if (userLoading || !currentUser) return null;

  if (!isManager) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Setting activity potential is available to managers only.
      </div>
    );
  }

  const total = catalog.length;
  const teamSet = employees.filter((e) => counts[e.user_id] > 0).length;
  const teamPct = employees.length ? Math.round((teamSet / employees.length) * 100) : 0;

  return (
    <div
      data-screen-label="Efficiency settings"
      style={{
        flex: 1,
        height: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "16px 20px 20px",
        minHeight: 0,
        overflow: "auto",
        color: C.n900,
      }}
    >
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
          <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            <h1 style={{ margin: 0, fontSize: 24, lineHeight: "32px", fontWeight: 600, color: C.n900 }}>
              Core activity targets
            </h1>
            <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: C.n500, textWrap: "pretty", maxWidth: 620 }}>
              Every activity is listed. Enter how long each one takes to see daily and monthly potential.
            </p>
          </div>

          <div role="tablist" aria-label="Settings" style={{ display: "flex", padding: 2, borderRadius: 8, background: C.n100 }}>
            {[
              ["Capacity", CalendarDays, false, "/efficiency/settings/monthly-capacity"],
              ["Activity targets", Target, true, null],
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

          <div style={{ display: "flex", alignItems: "center", borderRadius: 7, background: "#fff", boxShadow: `inset 0 0 0 1px ${C.n200}` }}>
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth(shiftMonth(month, -1))}
              style={{ width: 34, height: 34, border: "none", background: "transparent", cursor: "pointer", color: C.n700, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 112, textAlign: "center", color: C.n900 }}>
              {monthLabel(month)}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth(shiftMonth(month, 1))}
              style={{ width: 34, height: 34, border: "none", background: "transparent", cursor: "pointer", color: C.n700, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {loadingEmployees ? (
        <SettingsTableSkeleton columns={4} rows={8} label="Loading your team" />
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexWrap: "wrap", gap: 16, alignContent: "stretch" }}>
          {/* Team list */}
          <aside style={{ ...cardStyle, flex: "1 1 280px", maxWidth: "100%", minWidth: 240, maxHeight: "100%", minHeight: 280 }}>
            <div style={{ padding: "14px 14px 10px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: C.n900 }}>Team</span>
                <span style={{ fontSize: 12, color: C.n500 }}>
                  {teamSet} of {employees.length} set
                </span>
              </div>
              <div style={{ height: 4, borderRadius: 9999, background: C.n100, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${teamPct}%`, background: C.success500, borderRadius: 9999 }} />
              </div>
              <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                <Search size={14} style={{ position: "absolute", left: 10, color: C.n400, pointerEvents: "none" }} />
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
                const cnt = counts[e.user_id] || 0;
                const pill = cnt
                  ? [`${cnt} of ${total}`, C.n100, C.n700]
                  : ["None set", C.warning100, C.warningFg];
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
                    <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9999, background: C.brand50, color: C.brand700, fontSize: 12, lineHeight: "32px", fontWeight: 600, textAlign: "center" }}>
                      {initials(e.name)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 14, lineHeight: "18px", fontWeight: on ? 600 : 500, color: C.n900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {e.name}
                      </span>
                      <span style={{ fontSize: 12, lineHeight: "16px", color: C.n500 }}>{e.department || "—"}</span>
                    </span>
                    <span style={{ flexShrink: 0, padding: "2px 8px", borderRadius: 9999, background: pill[1], color: pill[2], fontSize: 11, lineHeight: "16px", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {pill[0]}
                    </span>
                  </button>
                );
              })}
              {filteredEmployees.length === 0 && (
                <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 13, color: C.n500 }}>No one matches.</div>
              )}
            </div>
          </aside>

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
        </div>
      )}
    </div>
  );
}
