import React, { useEffect, useMemo, useState } from "react";
import { X, Plus, Trash2, Clock, Save } from "lucide-react";

const STAGE_BY_DEPARTMENT = {
  Content: "Content",
  Design: "Design",
  Animation: "Animate",
  Finish: "Finish",
};

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

const emptyEntry = () => ({
  project_id: "",
  deliverable_id: "",
  deliverable_name: "",
  deliverable_type: "",
  work_category: "Core",
  remarks: "",
  time_taken_minutes: "",
});

const formatDuration = (minutes) => {
  if (!minutes) return "";
  const h = Math.floor(Number(minutes) / 60);
  const m = Number(minutes) % 60;

  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

export default function QuickLoggerModal({
  open,
  onClose,
  currentUser,
  projects = [],
  deliverables = [],
  options = {},
  onSave,
}) {
  const [entries, setEntries] = useState([emptyEntry()]);
  const [saving, setSaving] = useState(false);

  const stage =
    STAGE_BY_DEPARTMENT[currentUser?.department] ||
    currentUser?.department ||
    "";

  const deliverableTypes = options.deliverable_types || [];

  useEffect(() => {
    if (open) {
      setEntries([emptyEntry()]);
      setSaving(false);
    }
  }, [open]);

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects]
  );

  const getProjectDeliverables = (projectId) => {
    if (!projectId) return [];

    return deliverables.filter(
      (d) =>
        d.project_id === projectId ||
        d.projectId === projectId
    );
  };

  const updateEntry = (index, field, value) => {
    setEntries((prev) =>
      prev.map((entry, i) =>
        i === index
          ? {
              ...entry,
              [field]: value,
              ...(field === "project_id"
                ? {
                    deliverable_id: "",
                    deliverable_name: "",
                  }
                : {}),
              ...(field === "deliverable_id"
                ? {
                    deliverable_name:
                      deliverables.find((d) => d.id === value)?.name ||
                      deliverables.find((d) => d.id === value)
                        ?.deliverable_name ||
                      "",
                  }
                : {}),
            }
          : entry
      )
    );
  };

  const addEntry = () => {
    setEntries((prev) => [emptyEntry(), ...prev]);
  };

  const removeEntry = (index) => {
    if (entries.length === 1) return;

    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const isValid = (entry) => {
    return (
      entry.project_id &&
      entry.deliverable_type &&
      Number(entry.time_taken_minutes) > 0
    );
  };

  const handleSave = async () => {
    const hasAnyValue = (entry) =>
      entry.project_id ||
      entry.deliverable_id ||
      entry.deliverable_name ||
      entry.deliverable_type ||
      entry.remarks ||
      entry.time_taken_minutes;

    const filledEntries = entries.filter(hasAnyValue);
    const invalidEntries = filledEntries.filter((entry) => !isValid(entry));

    if (invalidEntries.length) {
      alert(
        "Please select a Project, Type, and Duration for every entry."
      );
      return;
    }

    if (!filledEntries.length) {
      alert("Please add at least one entry.");
      return;
    }

    setSaving(true);

    try {
      const today = new Date().toISOString().slice(0, 10);

      const payloads = filledEntries.map((entry) => ({
        work_date: today,
        project_id: entry.project_id || null,
        deliverable_id: entry.deliverable_id || null,
        deliverable_name: entry.deliverable_name || "",
        deliverable_type: entry.deliverable_type,
        work_category: "Core",
        stage: stage || null,
        remarks: entry.remarks || "",
        time_taken_minutes: Number(entry.time_taken_minutes),
        status: "Not Started",
      }));

      await onSave(payloads);

      setEntries([emptyEntry()]);
      onClose();
    } catch (error) {
      console.error("Quick Logger save failed:", error);
      alert("Could not save the entries. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleSave();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onKeyDown={handleKeyDown}
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Log Today&apos;s Work
            </h2>

            <p className="mt-0.5 text-sm text-slate-500">
              Quickly add work entries without using the worksheet.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto bg-slate-50 p-5">
          <div className="space-y-3">
            {entries.map((entry, index) => {
              const projectDeliverables = getProjectDeliverables(
                entry.project_id
              );

              return (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Entry {index + 1}
                    </span>

                    {entries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeEntry(index)}
                        className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Remove entry"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                    {/* Project */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Project <span className="text-red-500">*</span>
                      </label>

                      <select
                        value={entry.project_id}
                        onChange={(e) =>
                          updateEntry(
                            index,
                            "project_id",
                            e.target.value
                          )
                        }
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-slate-400"
                      >
                        <option value="">Select project</option>

                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Deliverable */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Deliverable
                      </label>

                      <select
                        value={entry.deliverable_id}
                        onChange={(e) =>
                          updateEntry(
                            index,
                            "deliverable_id",
                            e.target.value
                          )
                        }
                        disabled={!entry.project_id}
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm outline-none disabled:bg-slate-100"
                      >
                        <option value="">
                          {entry.project_id
                            ? "Select deliverable"
                            : "Select project first"}
                        </option>

                        {projectDeliverables.map((deliverable) => (
                          <option
                            key={deliverable.id}
                            value={deliverable.id}
                          >
                            {deliverable.name ||
                              deliverable.deliverable_name ||
                              "Untitled deliverable"}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Type */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Type <span className="text-red-500">*</span>
                      </label>

                      <select
                        value={entry.deliverable_type}
                        onChange={(e) =>
                          updateEntry(
                            index,
                            "deliverable_type",
                            e.target.value
                          )
                        }
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm outline-none focus:border-slate-400"
                      >
                        <option value="">Select type</option>

                        {deliverableTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Duration */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Duration <span className="text-red-500">*</span>
                      </label>

                      <div className="relative">
                        <Clock
                          size={15}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                        />

                        <input
                          type="number"
                          min="1"
                          value={entry.time_taken_minutes}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();

                              if (!isValid(entry)) {
                                alert(
                                  "Please select a Project, Type, and Duration before adding a row."
                                );
                                return;
                              }

                              addEntry();
                            }
                          }}
                          onChange={(e) =>
                            updateEntry(
                              index,
                              "time_taken_minutes",
                              e.target.value
                            )
                          }
                          placeholder="Minutes"
                          className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-2.5 text-sm outline-none focus:border-slate-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Deliverable Name + Stage + Category */}
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Deliverable Name
                      </label>

                      <input
                        type="text"
                        value={entry.deliverable_name}
                        onChange={(e) =>
                          updateEntry(
                            index,
                            "deliverable_name",
                            e.target.value
                          )
                        }
                        placeholder="Optional"
                        className="h-9 w-full rounded-md border border-slate-200 px-2.5 text-sm outline-none focus:border-slate-400"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Stage
                      </label>

                      <input
                        type="text"
                        value={stage}
                        disabled
                        className="h-9 w-full rounded-md border border-slate-200 bg-slate-100 px-2.5 text-sm text-slate-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Category
                      </label>

                      <input
                        type="text"
                        value="Core"
                        disabled
                        className="h-9 w-full rounded-md border border-slate-200 bg-slate-100 px-2.5 text-sm text-slate-500"
                      />
                    </div>
                  </div>

                  {/* Remarks */}
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Remarks
                    </label>

                    <input
                      type="text"
                      value={entry.remarks}
                      onChange={(e) =>
                        updateEntry(index, "remarks", e.target.value)
                      }
                      placeholder="Optional notes..."
                      className="h-9 w-full rounded-md border border-slate-200 px-2.5 text-sm outline-none focus:border-slate-400"
                    />
                  </div>

                  {/* Duration presets */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-slate-400">
                      Quick duration:
                    </span>

                    {DURATION_PRESETS.map((minutes) => (
                      <button
                        key={minutes}
                        type="button"
                        onClick={() =>
                          updateEntry(
                            index,
                            "time_taken_minutes",
                            minutes
                          )
                        }
                        className={`rounded-md border px-2.5 py-1 text-xs ${
                          Number(entry.time_taken_minutes) === minutes
                            ? "border-slate-400 bg-slate-100 text-slate-900"
                            : "border-slate-200 text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {formatDuration(minutes)}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add row */}
          <button
            type="button"
            onClick={addEntry}
            className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:border-slate-400 hover:bg-white"
          >
            <Plus size={16} />
            Add Entry · Enter
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-6 py-4">
          <div className="text-xs text-slate-400">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
            {" · "}
            <span className="hidden sm:inline">
              Enter to add · Cmd/Ctrl + Enter to save
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save All"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}