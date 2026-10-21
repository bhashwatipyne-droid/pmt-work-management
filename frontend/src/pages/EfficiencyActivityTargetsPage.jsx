import { makeMatcher } from "@/lib/search";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  getActivityCatalog,
  getEfficiencyOverview,
  getEmployeeTargets,
  getMonthlyCapacityList,
  upsertEmployeeTarget,
  deleteEmployeeTarget,
} from "@/services/api";

import { currentMonth } from "@/components/efficiency/EfficiencyFilters";
import { SettingsTableSkeleton } from "@/components/skeletons/Skeletons";
import { TargetsEditor } from "@/components/efficiency/targets/TargetsEditor";
import { TargetsTeamList } from "@/components/efficiency/targets/TargetsTeamList";
import { TargetsHeader } from "@/components/efficiency/targets/TargetsHeader";
import { C, fmtN } from "@/components/efficiency/targets/targetsTheme";

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
    const match = makeMatcher(search);
    return search.trim() ? employees.filter((e) => match(e.name)) : employees;
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
  const matchTarget = makeMatcher(tgtQ);
  const visible = rows.filter(
    (r) =>
      matchTarget(r.act) &&
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
        if (r.t) await deleteEmployeeTarget(employeeId, r.act);
      } else if (r.t) {
        await upsertEmployeeTarget({
          user_id: employeeId,
          activity_name: r.act,
          time_per_unit_minutes: val,
          active: r.t.active !== false,
        });
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
      await upsertEmployeeTarget({
        user_id: employeeId,
        activity_name: r.act,
        time_per_unit_minutes: Number(r.t.time_per_unit_minutes),
        active: !r.t.active,
      });
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
      await deleteEmployeeTarget(employeeId, r.act);
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


  const ctx = {
    busy,
    capCalc,
    clear,
    commitMin,
    counts,
    employeeId,
    employees,
    filteredEmployees,
    month,
    navigate,
    search,
    selectedRow,
    setDrafts,
    setEmployeeId,
    setMonth,
    setN,
    setSearch,
    setTgtFilter,
    setTgtQ,
    teamPct,
    teamSet,
    tgtFilter,
    tgtQ,
    toggle,
    total,
    visible,
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
      <TargetsHeader {...ctx} />

      {loadingEmployees ? (
        <SettingsTableSkeleton columns={4} rows={8} label="Loading your team" />
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexWrap: "wrap", gap: 16, alignContent: "stretch" }}>
          <TargetsTeamList {...ctx} />

          <TargetsEditor {...ctx} />
        </div>
      )}
    </div>
  );
}
