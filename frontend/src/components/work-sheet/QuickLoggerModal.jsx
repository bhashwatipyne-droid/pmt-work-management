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
    const invalidEntries = filledEntries.filter(
      (entry) => !isValid(entry)
    );

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

    if (
      (event.metaKey || event.ctrlKey) &&
      event.key === "Enter"
    ) {
      event.preventDefault();
      handleSave();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[1px]"
      onKeyDown={handleKeyDown}
    >
      <div className="flex h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0f0fd]">
                <Clock className="h-4 w-4 text-[#2b2bb5]" />
              </div>

              <h2 className="text-lg font-semibold text-foreground">
                Log Today&apos;s Work
              </h2>
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              Quickly add work entries without using the worksheet.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Entries */}
        <div className="flex-1 overflow-y-auto bg-[#f7f9fc] p-5">
          <div className="space-y-3">
            {entries.map((entry, index) => {
              const projectDeliverables = getProjectDeliverables(
                entry.project_id
              );

              return (
                <div
                  key={index}
                  className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-sm"
                >
                  {/* Entry header */}
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Entry {index + 1}
                    </span>

                    {entries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeEntry(index)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                        title="Remove entry"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Main fields */}
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                    {/* Project */}
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Project <span className="text-red-600">*</span>
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
                        className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
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
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                        className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
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
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Type <span className="text-red-600">*</span>
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
                        className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
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
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Duration <span className="text-red-600">*</span>
                      </label>

                      <div className="relative">
                        <Clock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

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
                          className="h-10 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Secondary fields */}
                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    {/* Deliverable Name */}
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
                        className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
                      />
                    </div>

                    {/* Stage */}
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Stage
                      </label>

                      <input
                        type="text"
                        value={stage}
                        disabled
                        className="h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground"
                      />
                    </div>

                    {/* Category */}
                    <div>
                      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Category
                      </label>

                      <input
                        type="text"
                        value="Core"
                        disabled
                        className="h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground"
                      />
                    </div>
                  </div>

                  {/* Remarks */}
                  <div className="mt-4">
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Remarks
                    </label>

                    <input
                      type="text"
                      value={entry.remarks}
                      onChange={(e) =>
                        updateEntry(index, "remarks", e.target.value)
                      }
                      placeholder="Optional notes..."
                      className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
                    />
                  </div>

                  {/* Duration presets */}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-xs font-medium text-muted-foreground">
                      Quick duration:
                    </span>

                    {DURATION_PRESETS.map((minutes) => {
                      const selected =
                        Number(entry.time_taken_minutes) === minutes;

                      return (
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
                          className={[
                            "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                            selected
                              ? "border-[#2b2bb5] bg-[#f0f0fd] text-[#1a1a8a]"
                              : "border-border bg-card text-muted-foreground hover:border-[#dcdcf8] hover:bg-[#fafbff] hover:text-foreground",
                          ].join(" ")}
                        >
                          {formatDuration(minutes)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add entry */}
          <button
            type="button"
            onClick={addEntry}
            className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-[#c9c9e8] bg-card px-4 py-2.5 text-sm font-medium text-[#2b2bb5] transition-colors hover:border-[#2b2bb5] hover:bg-[#f0f0fd]"
          >
            <Plus className="h-4 w-4" />
            Add Entry · Enter
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
          <div className="text-xs text-muted-foreground">
            {entries.length}{" "}
            {entries.length === 1 ? "entry" : "entries"}
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
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save All"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}