import { makeMatcher } from "@/lib/search";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Clock, Umbrella } from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  getEfficiencyOverview,
  getMonthlyCapacityList,
  saveMonthlyCapacity,
} from "@/services/api";

import { currentMonth, monthLabel, shiftMonth } from "@/components/efficiency/EfficiencyFilters";
import { SettingsTableSkeleton } from "@/components/skeletons/Skeletons";
import { CapacityEditor } from "@/components/efficiency/capacity/CapacityEditor";
import { CapacityTeamList } from "@/components/efficiency/capacity/CapacityTeamList";
import { CapacityHeader } from "@/components/efficiency/capacity/CapacityHeader";
import { C, DEFAULTS, SEG_SHADOW, fmtN, toForm } from "@/components/efficiency/capacity/capacityTheme";

// Mint design-system tokens used by the redesign prototype.
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
    const match = makeMatcher(search);
    return employees.filter(
      (e) => match(e.name) && (filter === "all" || !isSet(e.user_id))
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

  const ctx = {
    breakdown,
    btnOpacity,
    bump,
    copyPrev,
    coreDays,
    coreHours,
    dirty,
    employeeId,
    employees,
    fields,
    filter,
    filteredEmployees,
    form,
    hasValues,
    hpd,
    isSet,
    leaveErr,
    missingCount,
    month,
    navigate,
    prevMonthName,
    save,
    savedForm,
    saving,
    search,
    segBtn,
    selectedRow,
    setEmployeeId,
    setField,
    setFilter,
    setForm,
    setMonth,
    setN,
    setPct,
    setSearch,
    status,
  };

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
      <CapacityHeader {...ctx} />

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
          <CapacityTeamList {...ctx} />

          <CapacityEditor {...ctx} />
        </div>
      )}
    </div>
  );
}
