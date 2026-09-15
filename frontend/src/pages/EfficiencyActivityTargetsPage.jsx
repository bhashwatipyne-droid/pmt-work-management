import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  createActivityTarget,
  deleteActivityTarget,
  getActivityTargets,
  syncActivityTargets,
  updateActivityTarget,
} from "@/services/api";

const inputClass =
  "h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 " +
  "focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const emptyDraft = {
  activity_name: "",
  daily_potential: "",
  time_per_unit_minutes: "",
};

export default function EfficiencyActivityTargetsPage() {
  const { currentUser, loading: userLoading } = useUser();

  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({});
  const [draft, setDraft] = useState(emptyDraft);
  const [adding, setAdding] = useState(false);

  const canConfigure = ["admin", "manager"].includes(currentUser?.role);

  const load = useCallback(() => {
    setLoading(true);
    getActivityTargets()
      .then(setTargets)
      .catch(() => toast.error("Could not load activity targets"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(), [load]);

  const startEdit = (t) => {
    setEditingId(t.id);
    setEdit({
      daily_potential: String(t.daily_potential ?? 0),
      time_per_unit_minutes: String(t.time_per_unit_minutes ?? 0),
    });
  };

  const saveEdit = async (t) => {
    const nextDaily = Number(edit.daily_potential || 0);
    const nextTime = Number(edit.time_per_unit_minutes || 0);

    if (nextDaily < 0 || nextTime < 0) {
      toast.error("Values cannot be negative");
      return;
    }

    if (
      (t.daily_potential || 0) !== nextDaily &&
      !window.confirm(
        `Changing the daily potential for "${t.activity_name}" will change every productivity score that uses it, including past months. Continue?`
      )
    ) {
      return;
    }

    setBusyId(t.id);
    try {
      await updateActivityTarget(t.id, {
        daily_potential: nextDaily,
        time_per_unit_minutes: nextTime,
      });
      toast.success("Target updated");
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not update target");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (t) => {
    setBusyId(t.id);
    try {
      await updateActivityTarget(t.id, { active: !t.active });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not update target");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Remove "${t.activity_name}" from productivity tracking?`)) return;
    setBusyId(t.id);
    try {
      await deleteActivityTarget(t.id);
      toast.success("Activity removed");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not remove activity");
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    if (!draft.activity_name.trim()) {
      toast.error("Activity name is required");
      return;
    }
    setAdding(true);
    try {
      await createActivityTarget({
        activity_name: draft.activity_name.trim(),
        category: "Core",
        daily_potential: Number(draft.daily_potential || 0),
        time_per_unit_minutes: Number(draft.time_per_unit_minutes || 0),
        active: true,
      });
      toast.success("Activity added");
      setDraft(emptyDraft);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not add activity");
    } finally {
      setAdding(false);
    }
  };

  const sync = async () => {
    try {
      const res = await syncActivityTargets();
      toast.success(
        res.created
          ? `${res.created} core deliverable type${res.created > 1 ? "s" : ""} imported as inactive`
          : "All core deliverable types are already listed"
      );
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not import deliverable types");
    }
  };

  if (userLoading || !currentUser) return null;

  if (!canConfigure) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Activity targets are configurable by managers and admins only
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
            Define what 100% productivity means for each core activity
          </p>
        </div>

        <button
          type="button"
          onClick={sync}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Import deliverable types
        </button>
      </div>

      {/* Add new */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Add activity</h3>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
          <input
            placeholder="Activity name, e.g. Carousel"
            value={draft.activity_name}
            onChange={(e) => setDraft({ ...draft, activity_name: e.target.value })}
            className={inputClass}
            data-testid="activity-target-name"
          />
          <input
            type="number"
            min="0"
            placeholder="Daily potential"
            value={draft.daily_potential}
            onChange={(e) => setDraft({ ...draft, daily_potential: e.target.value })}
            className={inputClass}
          />
          <input
            type="number"
            min="0"
            placeholder="Minutes per unit"
            value={draft.time_per_unit_minutes}
            onChange={(e) => setDraft({ ...draft, time_per_unit_minutes: e.target.value })}
            className={inputClass}
          />
          <button
            type="button"
            onClick={add}
            disabled={adding}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-xs font-semibold text-white hover:bg-[#23239a] disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          The activity name must match the deliverable type used on the Work Sheet, otherwise closed
          deliverables will not be counted against it.
        </p>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {targets.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 sm:col-span-2 xl:col-span-3">
              No activities configured yet. Add one above or import the core deliverable types.
            </div>
          )}

          {targets.map((t) => {
            const isEditing = editingId === t.id;

            return (
              <div
                key={t.id}
                className={`rounded-xl border p-4 ${
                  t.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-70"
                }`}
                data-testid={`activity-target-${t.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{t.activity_name}</div>
                    <div className="text-xs text-slate-400">{t.category} activity</div>
                  </div>

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
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      Daily potential
                    </div>
                    {isEditing ? (
                      <input
                        type="number"
                        min="0"
                        value={edit.daily_potential}
                        onChange={(e) => setEdit({ ...edit, daily_potential: e.target.value })}
                        className={`${inputClass} mt-1`}
                      />
                    ) : (
                      <div className="mt-0.5 text-xl font-semibold text-slate-900">
                        {t.daily_potential}
                      </div>
                    )}
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
        </div>
      )}
    </div>
  );
}