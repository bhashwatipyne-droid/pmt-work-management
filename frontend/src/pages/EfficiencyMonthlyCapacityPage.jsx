import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock,
  Umbrella,
  Target,
  Copy,
  Plus,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  getEfficiencyOverview,
  getMonthlyCapacityList,
  saveMonthlyCapacity,
} from "@/services/api";

import { currentMonth, monthLabel, shiftMonth } from "@/components/efficiency/EfficiencyFilters";
import { SettingsTableSkeleton } from "@/components/skeletons/Skeletons";

// Mint design-system tokens used by the redesign prototype.
const C = {
  brand50: "rgb(240,240,253)",
  brand100: "rgb(220,220,248)",
  brand400: "rgb(61,61,204)",
  brand500: "rgb(43,43,181)",
  brand700: "rgb(26,26,138)",
  n50: "rgb(249,250,251)",
  n100: "rgb(245,246,248)",
  n200: "rgb(239,240,242)",
  n400: "rgb(138,151,181)",
  n500: "rgb(84,100,144)",
  n700: "rgb(74,88,120)",
  n900: "rgb(13,27,62)",
  line: "rgb(234,238,244)",
  lineSoft: "rgb(243,244,246)",
  success100: "rgb(209,250,229)",
  success500: "rgb(16,185,129)",
  successFg: "rgb(0,91,75)",
  warning100: "rgb(254,243,199)",
  warning500: "rgb(245,158,11)",
  warningFg: "rgb(146,64,14)",
  error500: "rgb(239,68,68)",
};

const SEG_SHADOW = "0 1px 2px 0 rgba(13,28,61,0.05)";
const DEFAULTS = { wd: 22, lv: 0, hpd: 8.5 };

const fmtN = (v, d = 0) => {
  const n = Number(v) || 0;
  return n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
};

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

const stepBtnStyle = {
  width: 36,
  height: 36,
  flexShrink: 0,
  border: "none",
  borderRadius: 7,
  background: C.n50,
  boxShadow: `inset 0 0 0 1px ${C.n200}`,
  color: C.n700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
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

const toForm = (cap) =>
  cap
    ? {
        wd: String(cap.working_days),
        lv: String(cap.leave_days),
        hpd: String(cap.working_hours_per_day),
      }
    : { wd: "", lv: "", hpd: "" };

export default function EfficiencyMonthlyCapacityPage() {
  const navigate = useNavigate();
  const { currentUser, loading: userLoading } = useUser();

  const [month, setMonth] = useState(currentMonth());
  const [employeeId, setEmployeeId] = useState("");
  const [employees, setEmployees] = useState([]);
  const [capacities, setCapacities] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [form, setForm] = useState({ wd: "", lv: "", hpd: "" });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Manager-only: admins and members can read Efficiency but not edit capacity.
  const canConfigure = currentUser?.role === "manager";

  const load = useCallback(() => {
    let cancelled = false;
    setLoading((prev) => prev || employees.length === 0);

    Promise.all([getEfficiencyOverview(month), getMonthlyCapacityList({ month })])
      .then(([overview, caps]) => {
        if (cancelled) return;
        // Everyone can see everyone's efficiency, but a manager can only set
        // capacity for their own department (the API enforces it too).
        const mine = (overview.employees || []).filter(
          (e) => e.department === currentUser?.department
        );
        setEmployees(mine);
        setCapacities(caps || []);
        setEmployeeId((prev) => prev || mine[0]?.user_id || "");
      })
      .catch(() => !cancelled && toast.error("Could not load employees for this month"))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, currentUser?.department]);

  useEffect(() => load(), [load]);

  const isSet = useCallback(
    (id) => capacities.some((c) => c.user_id === id),
    [capacities]
  );

  const missingCount = useMemo(
    () => employees.filter((e) => !isSet(e.user_id)).length,
    [employees, isSet]
  );

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(
      (e) =>
        (!q || e.name?.toLowerCase().includes(q)) && (filter === "all" || !isSet(e.user_id))
    );
  }, [employees, search, filter, isSet]);

  const selectedRow = useMemo(
    () => employees.find((e) => e.user_id === employeeId),
    [employees, employeeId]
  );

  const existingCapacity = useMemo(
    () => capacities.find((c) => c.user_id === employeeId),
    [capacities, employeeId]
  );

  const savedForm = useMemo(() => toForm(existingCapacity), [existingCapacity]);

  // Reset the form whenever the target employee or month changes.
  useEffect(() => {
    setForm(savedForm);
  }, [savedForm, employeeId, month]);

  const dirty = form.wd !== savedForm.wd || form.lv !== savedForm.lv || form.hpd !== savedForm.hpd;
  const hasValues = form.wd !== "" || form.lv !== "" || form.hpd !== "";

  const wd = Number(form.wd || 0);
  const ld = Math.min(Number(form.lv || 0), wd);
  const hpd = Number(form.hpd || 0);
  const nonCoreHours = selectedRow?.non_core_hours || 0;

  const days = wd - ld;
  const monthlyHours = days * hpd;
  const coreHours = Math.max(0, monthlyHours - nonCoreHours);
  const coreDays = hpd ? coreHours / hpd : 0;

  const leaveErr = hasValues && Number(form.lv || 0) > wd;

  const validationError = (() => {
    if (form.wd === "" || form.hpd === "") return "Enter working days and hours first";
    if (wd < 0 || wd > 31) return "Working days must be between 0 and 31";
    if (Number(form.lv || 0) < 0) return "Leave days cannot be negative";
    if (leaveErr) return "Leave days cannot exceed working days";
    if (hpd <= 0) return "Hours per day must be greater than zero";
    if (monthlyHours < nonCoreHours)
      return "Non-core hours already logged exceed the monthly working hours";
    return null;
  })();

  const setField = (k, val) => setForm((f) => ({ ...f, [k]: val }));

  const bump = (k, d, min, max) => () =>
    setForm((f) => {
      const base = f.wd === "" && f.lv === "" && f.hpd === "" ? DEFAULTS : f;
      const cur = Number(base[k]) || 0;
      const next = Math.max(min, Math.min(max, Math.round((cur + d) * 2) / 2));
      return {
        wd: String(base.wd ?? ""),
        lv: String(base.lv ?? ""),
        hpd: String(base.hpd ?? ""),
        [k]: String(next),
      };
    });

  const save = async (next) => {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (!employeeId) return;
    setSaving(true);
    try {
      await saveMonthlyCapacity({
        user_id: employeeId,
        month,
        working_days: wd,
        leave_days: Number(form.lv || 0),
        working_hours_per_day: hpd,
      });
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not save capacity");
      setSaving(false);
      return;
    }
    setSaving(false);
    const name = selectedRow?.name || "employee";
    toast.success(`Capacity saved for ${name}`);

    if (next) {
      // Jump to the next person still missing capacity, wrapping around.
      const order = employees.map((e) => e.user_id);
      const i = order.indexOf(employeeId);
      const rest = order.slice(i + 1).concat(order.slice(0, i));
      const nxt = rest.find((id) => !isSet(id)) || order[(i + 1) % order.length];
      if (nxt) setEmployeeId(nxt);
    }
    load();
  };

  const copyPrev = async () => {
    const prev = shiftMonth(month, -1);
    const prevName = monthLabel(prev).split(" ")[0];
    try {
      const caps = await getMonthlyCapacityList({ month: prev });
      const found = (caps || []).find((c) => c.user_id === employeeId);
      setForm(found ? toForm(found) : { wd: "22", lv: "0", hpd: "8.5" });
      toast.success(`Copied ${prevName} values · review and save`);
    } catch {
      toast.error(`Could not load ${prevName} capacity`);
    }
  };

  if (userLoading || !currentUser) return null;

  if (!canConfigure) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Monthly capacity setup is available to managers only
      </div>
    );
  }

  const shortMonth = monthLabel(month).split(" ")[0];
  const prevMonthName = monthLabel(shiftMonth(month, -1)).split(" ")[0];
  const setN = employees.length - missingCount;
  const setPct = employees.length ? Math.round((setN / employees.length) * 100) : 0;

  const fields = [
    ["wd", "Working days", `Days in ${shortMonth} the office is open`, 1, 0, 31, CalendarDays, "22"],
    ["lv", "Leave days", "Approved leave this month", 1, 0, 31, Umbrella, "0"],
    ["hpd", "Hours per day", "Standard working hours", 0.5, 0, 24, Clock, "8.5"],
  ];

  const breakdown = hasValues
    ? [
        ["Working days", `${fmtN(wd, 1)} − ${fmtN(ld, 1)} leave`, `${fmtN(days)} days`, false],
        ["Monthly hours", `${fmtN(days)} days × ${fmtN(hpd, 1)}h`, `${fmtN(monthlyHours, 1)}h`, false],
        ["Non-core time", "Logged by the team", `− ${fmtN(nonCoreHours, 1)}h`, false],
        ["Core hours", "Available for core activities", `${fmtN(coreHours, 1)}h`, true],
        ["Core days", `${fmtN(coreHours, 1)}h ÷ ${fmtN(hpd, 1)}h`, `${fmtN(coreDays)} days`, false],
      ]
    : [];

  const saved = !!existingCapacity;
  const status = dirty
    ? ["Unsaved changes", C.brand700, C.brand500]
    : saved
      ? [`Saved · configured for ${shortMonth}`, C.successFg, C.success500]
      : [`Not set for ${shortMonth}`, C.warningFg, C.warning500];
  const btnOpacity = dirty || !saved ? 1 : 0.45;

  const segBtn = (active) => ({
    background: active ? "#fff" : "transparent",
    boxShadow: active ? SEG_SHADOW : "none",
  });

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

      {loading ? (
        <SettingsTableSkeleton columns={6} rows={8} label="Loading monthly capacity" />
      ) : (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignContent: "stretch",
          }}
        >
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
        </div>
      )}
    </div>
  );
}
