import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Loader2,
  Plus,
  Trash2,
  Search,
  Info,
  Target,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  getActivityCatalog,
  getEfficiencyOverview,
  getEmployeeTargets,
  upsertEmployeeTarget,
  updateEmployeeTarget,
  deleteEmployeeTarget,
} from "@/services/api";

import { currentMonth, monthLabel } from "@/components/efficiency/EfficiencyFilters";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const fieldClass =
  "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 " +
  "focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const inputClass =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 " +
  "focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const emptyDraft = { activity_name: "", time_per_unit_minutes: "" };

export default function EfficiencyActivityTargetsPage() {
  const { currentUser, loading: userLoading } = useUser();
  const isManager = currentUser?.role === "manager";
  const month = currentMonth();

  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [targets, setTargets] = useState([]);

  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});
  const [draft, setDraft] = useState(emptyDraft);
  const [adding, setAdding] = useState(false);

  // Employees this manager can set potential for — the overview endpoint is already
  // department-scoped for managers, so it doubles as "my team" here.
  useEffect(() => {
    if (!isManager) {
      setLoadingEmployees(false);
      return;
    }
    let cancelled = false;
    setLoadingEmployees(true);
    Promise.all([getEfficiencyOverview(month), getActivityCatalog()])
      .then(([overview, activityCatalog]) => {
        if (cancelled) return;
        setEmployees(overview.employees || []);
        setCatalog(activityCatalog || []);
        setEmployeeId((prev) => prev || overview.employees?.[0]?.user_id || "");
      })
      .catch(() => !cancelled && toast.error("Could not load your team"))
      .finally(() => !cancelled && setLoadingEmployees(false));
    return () => {
      cancelled = true;
    };
  }, [isManager, month]);

  const loadTargets = useCallback(() => {
    if (!employeeId) return;
    setLoadingTargets(true);
    getEmployeeTargets(employeeId, month)
      .then(setTargets)
      .catch(() => toast.error("Could not load potential for this employee"))
      .finally(() => setLoadingTargets(false));
  }, [employeeId, month]);

  useEffect(() => loadTargets(), [loadTargets]);

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.trim().toLowerCase();
    return employees.filter((e) => e.name?.toLowerCase().includes(q));
  }, [employees, search]);

  const availableToAdd = useMemo(() => {
    const used = new Set(targets.map((t) => t.activity_name));
    return catalog.filter((name) => !used.has(name));
  }, [catalog, targets]);

  const startEdit = (t) => {
    setEditingId(t.id);
    setEdit({ time_per_unit_minutes: String(t.time_per_unit_minutes ?? 0) });
  };

  const saveEdit = async (t) => {
    const nextTime = Number(edit.time_per_unit_minutes || 0);

    if (nextTime <= 0) {
      toast.error("Minutes per unit must be greater than zero");
      return;
    }

    if (
      (t.time_per_unit_minutes || 0) !== nextTime &&
      !window.confirm(
        `Changing the time for "${t.activity_name}" recalculates this employee's potential — and therefore their productivity score — for every month that uses it, including past months. Continue?`
      )
    ) {
      return;
    }

    setBusyId(t.id);
    try {
      await updateEmployeeTarget(t.id, { time_per_unit_minutes: nextTime });
      toast.success("Potential updated");
      setEditingId(null);
      loadTargets();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not update potential");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (t) => {
    setBusyId(t.id);
    try {
      await updateEmployeeTarget(t.id, { active: !t.active });
      loadTargets();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not update potential");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Remove "${t.activity_name}" from ${activeEmployeeName}'s tracked activities?`))
      return;
    setBusyId(t.id);
    try {
      await deleteEmployeeTarget(t.id);
      toast.success("Removed");
      loadTargets();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not remove activity");
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    if (!draft.activity_name) {
      toast.error("Choose an activity");
      return;
    }
    const minutes = Number(draft.time_per_unit_minutes || 0);
    if (minutes <= 0) {
      toast.error("Enter minutes per unit greater than zero");
      return;
    }
    setAdding(true);
    try {
      await upsertEmployeeTarget({
        user_id: employeeId,
        activity_name: draft.activity_name,
        time_per_unit_minutes: minutes,
        active: true,
      });
      toast.success("Potential added");
      setDraft(emptyDraft);
      loadTargets();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not add potential");
    } finally {
      setAdding(false);
    }
  };

  const selectedRow = employees.find((e) => e.user_id === employeeId);
  const activeEmployeeName = selectedRow?.name || "this employee";

  if (userLoading || !currentUser) return null;

  if (!isManager) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Setting activity potential is available to managers only.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <Link
        to="/efficiency"
        className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Efficiency
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Core activity targets
          </h1>
          <p className="text-sm text-slate-500">
            Set how long each core activity takes this person — their daily and monthly
            potential is calculated automatically from their capacity, not entered by hand.
          </p>
        </div>

        <div className="flex max-w-sm items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            <span className="font-semibold">How this works:</span> Potential = this month's Core
            hours ÷ minutes per unit for the activity. It updates automatically as capacity
            changes each month.
          </span>
        </div>
      </div>

      {loadingEmployees ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          {/* Team list */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="mb-2 text-sm font-semibold text-slate-800">Your team</div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search employees..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${fieldClass} w-full pl-8`}
                />
              </div>
            </div>
            <div className="max-h-[520px] overflow-y-auto">
              {filteredEmployees.map((e) => {
                const active = e.user_id === employeeId;
                return (
                  <button
                    key={e.user_id}
                    type="button"
                    onClick={() => setEmployeeId(e.user_id)}
                    className={`flex w-full items-center gap-2.5 border-b border-l-2 border-slate-100 px-3.5 py-3 text-left text-sm last:border-0 ${
                      active
                        ? "border-l-[#2b2bb5] bg-[#f0f0fd]"
                        : "border-l-transparent hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-[#1a1a8a] ring-1 ring-slate-200">
                      {(e.name || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">{e.name}</span>
                      <span className="block truncate text-xs text-slate-400">
                        {e.department || "—"}
                      </span>
                    </span>
                  </button>
                );
              })}
              {filteredEmployees.length === 0 && (
                <div className="px-4 py-6 text-sm text-slate-500">No team members found.</div>
              )}
            </div>
          </div>

          {/* Potential editor */}
          <div>
            {!employeeId ? (
              <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                Select a team member to configure their potential.
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-slate-900">
                    Activity targets for {activeEmployeeName}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedRow?.department || "—"} · {monthLabel(month)}
                  </p>
                </div>

                <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-slate-600">Activity</span>
                      <select
                        value={draft.activity_name}
                        onChange={(e) => setDraft({ ...draft, activity_name: e.target.value })}
                        className={inputClass}
                      >
                        <option value="">Choose activity…</option>
                        {availableToAdd.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-slate-600">Minutes per unit</span>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 60"
                        value={draft.time_per_unit_minutes}
                        onChange={(e) =>
                          setDraft({ ...draft, time_per_unit_minutes: e.target.value })
                        }
                        className={inputClass}
                      />
                    </label>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={add}
                        disabled={adding || availableToAdd.length === 0}
                        className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-xs font-semibold text-white hover:bg-[#23239a] disabled:opacity-50"
                      >
                        {adding ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        Add
                      </button>
                    </div>
                  </div>
                  {availableToAdd.length === 0 && catalog.length > 0 && (
                    <p className="mt-2 text-xs text-slate-400">
                      Every core activity already has potential set for this employee.
                    </p>
                  )}
                </div>

                {loadingTargets ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {targets.map((t) => {
                      const isEditing = editingId === t.id;
                      return (
                        <div
                          key={t.id}
                          className={`rounded-xl border p-4 ${
                            t.active
                              ? "border-slate-200 bg-white"
                              : "border-slate-200 bg-slate-50 opacity-70"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                                <Target className="h-4 w-4" />
                              </span>
                              <span className="truncate text-sm font-semibold text-slate-900">
                                {t.activity_name}
                              </span>
                            </div>

                            <div className="flex flex-shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleActive(t)}
                                disabled={busyId === t.id}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  t.active
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-slate-200 text-slate-600"
                                }`}
                              >
                                {t.active ? "Active" : "Inactive"}
                              </button>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label="Activity actions"
                                    className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                  >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => startEdit(t)}>
                                    Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => remove(t)}>
                                    Remove
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <div>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                Daily potential
                              </div>
                              <div className="mt-0.5 text-xl font-semibold text-slate-900">
                                {t.daily_potential ?? 0}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Calculated from this month's core hours
                              </div>
                            </div>

                            <div>
                              <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                Time per unit
                              </div>
                              {isEditing ? (
                                <input
                                  type="number"
                                  min="0"
                                  value={edit.time_per_unit_minutes}
                                  onChange={(e) =>
                                    setEdit({ ...edit, time_per_unit_minutes: e.target.value })
                                  }
                                  className={`${inputClass} mt-1`}
                                />
                              ) : (
                                <div className="mt-0.5 text-xl font-semibold text-slate-900">
                                  {t.time_per_unit_minutes} min
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-between">
                            {isEditing ? (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => saveEdit(t)}
                                  disabled={busyId === t.id}
                                  className="rounded-md bg-[#2b2bb5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#23239a] disabled:opacity-50"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingId(null)}
                                  className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEdit(t)}
                                className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                Edit
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => remove(t)}
                              disabled={busyId === t.id}
                              aria-label="Remove activity"
                              className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    <div
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-6 text-center ${
                        targets.length === 0 ? "sm:col-span-2 lg:col-span-3" : ""
                      }`}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                        <Plus className="h-4 w-4" />
                      </span>
                      <div className="text-sm font-semibold text-slate-700">
                        {targets.length === 0 ? "No activity targets yet" : "Add another activity"}
                      </div>
                      <p className="text-xs text-slate-400">
                        Add the activities this employee is expected to complete during core
                        hours.
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}