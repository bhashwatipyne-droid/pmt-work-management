import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Clock, Save, Check, AlertCircle } from "lucide-react";

const STAGE_BY_DEPARTMENT = {
  Content: "Content",
  Design: "Design",
  Animation: "Animate",
  Finish: "Finish",
};

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

const emptyDraft = () => ({
  text: "",
  client_id: "",
  project_id: "",
  deliverable_id: "",
  deliverable_type: "",
  time_taken_minutes: "",
  remarks: "",
});

const formatDuration = (minutes) => {
  const value = Number(minutes);
  if (!value) return "";
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

const parseDuration = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;

  const hours = text.match(/^(\d+(?:\.\d+)?)\s*h$/);
  if (hours) return Math.round(Number(hours[1]) * 60);

  const minutes = text.match(/^(\d+)\s*m?$/);
  if (minutes) return Number(minutes[1]);

  return null;
};

const normalise = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

const fuzzyMatches = (items, query, getLabel, limit = 8) => {
  const q = normalise(query);
  if (!q) return items.slice(0, limit);

  return items
    .map((item, index) => {
      const label = normalise(getLabel(item));
      let score = 0;
      if (label === q) score = 100;
      else if (label.startsWith(q)) score = 80;
      else if (label.includes(q)) score = 60;
      else if (q.split(" ").every((word) => label.includes(word))) score = 40;
      return { item, score, index };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.item);
};

export default function QuickLoggerModal({
  open,
  onClose,
  currentUser,
  projects = [],
  deliverables = [],
  clients = [],
  options = {},
  onSave,
}) {
  const [draft, setDraft] = useState(emptyDraft());
  const [savedEntries, setSavedEntries] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showRemark, setShowRemark] = useState(false);
  const inputRef = useRef(null);
  const suggestionRefs = useRef([]);
  const committingRef = useRef(false);

  const stage =
    STAGE_BY_DEPARTMENT[currentUser?.department] ||
    currentUser?.department ||
    "";

  const deliverableTypes = options.deliverable_types || [];
  const deliverableTypeCategories =
    options.deliverable_type_categories || {};

  const projectMap = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects]
  );

  const clientMap = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients]
  );

  const deliverablesByProject = useMemo(() => {
    const map = new Map();
    deliverables.forEach((d) => {
      const projectId = d.project_id || d.projectId;
      if (!projectId) return;
      if (!map.has(projectId)) map.set(projectId, []);
      map.get(projectId).push(d);
    });
    return map;
  }, [deliverables]);

  const parts = useMemo(() => {
    const values = draft.text.split("/");
    return {
      client: (values[0] || "").trim(),
      project: (values[1] || "").trim(),
      deliverable: (values[2] || "").trim(),
      type: (values[3] || "").trim(),
      duration: (values[4] || "").trim(),
    };
  }, [draft.text]);

  const resolvedClient = useMemo(() => {
    if (draft.client_id) return clientMap.get(draft.client_id) || null;
    return (
      clients.find((c) => normalise(c.name) === normalise(parts.client)) ||
      null
    );
  }, [draft.client_id, clientMap, clients, parts.client]);

  const clientProjects = useMemo(
    () =>
      resolvedClient
        ? projects.filter((p) => p.client_id === resolvedClient.id)
        : [],
    [projects, resolvedClient]
  );

  const resolvedProject = useMemo(() => {
    if (draft.project_id) return projectMap.get(draft.project_id) || null;
    return (
      clientProjects.find(
        (p) => normalise(p.name) === normalise(parts.project)
      ) || null
    );
  }, [draft.project_id, projectMap, clientProjects, parts.project]);

  const projectDeliverables = useMemo(
    () => (resolvedProject ? deliverablesByProject.get(resolvedProject.id) || [] : []),
    [deliverablesByProject, resolvedProject]
  );

  const resolvedDeliverable = useMemo(() => {
    if (draft.deliverable_id) {
      return deliverables.find((d) => d.id === draft.deliverable_id) || null;
    }
    return (
      projectDeliverables.find(
        (d) =>
          normalise(d.name || d.deliverable_name) ===
          normalise(parts.deliverable)
      ) || null
    );
  }, [
    deliverables,
    draft.deliverable_id,
    parts.deliverable,
    projectDeliverables,
  ]);

  const resolvedType = useMemo(
    () =>
      deliverableTypes.find(
        (type) => normalise(type) === normalise(draft.deliverable_type || parts.type)
      ) || "",
    [deliverableTypes, draft.deliverable_type, parts.type]
  );

  const parsedDuration = parseDuration(
    draft.time_taken_minutes || parts.duration
  );

  const currentStep = useMemo(() => {
    if (!draft.text.trim()) return "client";
    if (!resolvedClient) return "client";
    if (!resolvedProject) return "project";
    if (!resolvedDeliverable) return "deliverable";
    if (!resolvedType) return "type";
    if (!parsedDuration || parsedDuration <= 0) return "duration";
    return "complete";
  }, [
    draft.text,
    parsedDuration,
    resolvedClient,
    resolvedDeliverable,
    resolvedProject,
    resolvedType,
  ]);

  useEffect(() => {
    if (!open) return;
    setDraft(emptyDraft());
    setSavedEntries([]);
    setSuggestions([]);
    setHighlightedIndex(0);
    setSaving(false);
    setError("");
    setShowRemark(false);
    committingRef.current = false;
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    const step = currentStep;
    let next = [];

    if (step === "client") {
      next = fuzzyMatches(clients, parts.client, (c) => c.name);
    } else if (step === "project") {
      next = fuzzyMatches(clientProjects, parts.project, (p) => p.name);
    } else if (step === "deliverable") {
      next = fuzzyMatches(
        projectDeliverables,
        parts.deliverable,
        (d) => d.name || d.deliverable_name || "Untitled deliverable"
      );
    } else if (step === "type") {
      next = fuzzyMatches(deliverableTypes, parts.type, (t) => t);
    }

    setSuggestions(next);
    setHighlightedIndex(0);
  }, [
    currentStep,
    clientProjects,
    clients,
    deliverableTypes,
    parts.client,
    parts.deliverable,
    parts.project,
    parts.type,
    projectDeliverables,
  ]);

  useEffect(() => {
    suggestionRefs.current[highlightedIndex]?.scrollIntoView?.({
      block: "nearest",
    });
  }, [highlightedIndex]);

  const updateDraft = (patch) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setError("");
  };

  const selectSuggestion = (item) => {
    if (currentStep === "client") {
      updateDraft({
        client_id: item.id,
        project_id: "",
        deliverable_id: "",
        deliverable_type: "",
        time_taken_minutes: "",
        text: `${item.name} / `,
      });
    } else if (currentStep === "project") {
      updateDraft({
        project_id: item.id,
        deliverable_id: "",
        deliverable_type: "",
        time_taken_minutes: "",
        text: `${parts.client} / ${item.name} / `,
      });
    } else if (currentStep === "deliverable") {
      const name = item.name || item.deliverable_name || "";
      updateDraft({
        deliverable_id: item.id,
        deliverable_type: "",
        time_taken_minutes: "",
        text: `${parts.client} / ${parts.project} / ${name} / `,
      });
    } else if (currentStep === "type") {
      updateDraft({
        deliverable_type: item,
        time_taken_minutes: "",
        text: `${parts.client} / ${parts.project} / ${parts.deliverable} / ${item} / `,
      });
    }

    setHighlightedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const buildEntry = () => {
    if (
      !resolvedClient ||
      !resolvedProject ||
      !resolvedDeliverable ||
      !resolvedType ||
      !parsedDuration ||
      parsedDuration <= 0
    ) {
      return null;
    }

    return {
      text: draft.text.trim(),
      client_id: resolvedClient.id,
      project_id: resolvedProject.id,
      deliverable_id: resolvedDeliverable.id,
      deliverable_name:
        resolvedDeliverable.name ||
        resolvedDeliverable.deliverable_name ||
        "",
      deliverable_type: resolvedType,
      work_category: deliverableTypeCategories[resolvedType] || "",
      stage: stage || null,
      remarks: draft.remarks || "",
      time_taken_minutes: parsedDuration,
      status: "Not Started",
    };
  };

  const commitDraft = () => {
    // Guard against the same entry being committed twice in a row —
    // e.g. if a key event fires again before React has cleared the input.
    if (committingRef.current) return false;

    const entry = buildEntry();

    if (!entry) {
      setError(
        currentStep === "client"
          ? "Select a Client first."
          : currentStep === "project"
          ? "Select a Project first."
          : currentStep === "deliverable"
          ? "Select a Deliverable for this Project."
          : currentStep === "type"
          ? "Select a Type."
          : "Enter a valid Duration, such as 45m or 1h."
      );
      return false;
    }

    committingRef.current = true;

    setSavedEntries((prev) => [entry, ...prev]);
    setDraft(emptyDraft());
    setSuggestions([]);
    setShowRemark(false);
    setError("");
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      committingRef.current = false;
    });
    return true;
  };

  const handleSave = async () => {
    const entriesToSave = [...savedEntries];
    const currentEntry = draft.text.trim() ? buildEntry() : null;

    if (draft.text.trim() && !currentEntry) {
      setError("Please complete Project, Deliverable, Type, and Duration.");
      return;
    }

    if (currentEntry) entriesToSave.unshift(currentEntry);

    if (!entriesToSave.length) {
      setError("Please add at least one work entry.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const today = new Date().toISOString().slice(0, 10);

      const payloads = entriesToSave.map((entry) => ({
        work_date: today,
        client_id: entry.client_id,
        project_id: entry.project_id,
        deliverable_id: entry.deliverable_id,
        deliverable_name: entry.deliverable_name || "",
        deliverable_type: entry.deliverable_type,
        work_category:
          entry.work_category ||
          deliverableTypeCategories[entry.deliverable_type] ||
          "",
        stage: entry.stage || stage || null,
        remarks: entry.remarks || "",
        time_taken_minutes: Number(entry.time_taken_minutes),
        status: "Not Started",
      }));

      await onSave(payloads);

      setDraft(emptyDraft());
      setSavedEntries([]);
      onClose();
    } catch (saveError) {
      console.error("Quick Logger save failed:", saveError);
      setError("Could not save the entries. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (event) => {
    // Ignore OS/browser key auto-repeat entirely. Without this, holding
    // Enter even slightly longer than a tap can fire multiple keydown
    // events before React finishes clearing the input, which was
    // committing the same entry twice.
    if (event.repeat) {
      event.preventDefault();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    // Check Cmd/Ctrl+Enter BEFORE the plain Enter branch below.
    // Previously the plain `event.key === "Enter"` check matched and
    // returned first regardless of modifier keys, so Cmd/Ctrl+Enter could
    // never reach handleSave() — it silently called commitDraft() instead,
    // which is also part of what produced unexpected duplicate entries.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      handleSave();
      return;
    }

    if (event.key === "ArrowDown" && suggestions.length) {
      event.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length) {
      event.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (event.key === "Tab" && suggestions.length) {
      event.preventDefault();
      selectSuggestion(suggestions[highlightedIndex]);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();

      if (suggestions.length) {
        selectSuggestion(suggestions[highlightedIndex]);
        return;
      }

      if (currentStep === "complete") {
        commitDraft();
        return;
      }

      setError(
        currentStep === "client"
          ? "Select a Client first."
          : currentStep === "project"
          ? "Select a Project first."
          : currentStep === "deliverable"
          ? "Select a Deliverable for this Project."
          : currentStep === "type"
          ? "Select a Type."
          : "Enter a valid Duration, such as 45m or 1h."
      );
      return;
    }
  };

  const setQuickDuration = (minutes) => {
    const value = `${parts.client} / ${parts.project} / ${parts.deliverable} / ${parts.type} / ${formatDuration(minutes)}`;
    updateDraft({
      text: value,
      time_taken_minutes: minutes,
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[1px]">
      <div className="flex h-[calc(100vh-32px)] w-[calc(100vw-32px)] max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0f0fd]">
                <Clock className="h-4 w-4 text-[#2b2bb5]" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                Log everything at once
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Type one line per task. Arrow keys navigate, Enter selects, and
              Enter on a complete line logs it.
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

        <div className="flex-1 overflow-y-auto bg-[#f7f9fc] p-6">
          <div className="mx-auto w-full max-w-5xl space-y-5">
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    New work entry
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Client / Project / Deliverable / Type / Time
                  </div>
                </div>
                {draft.text && (
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {currentStep === "complete"
                      ? "Ready to log"
                      : `Select ${currentStep}`}
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  ref={inputRef}
                  type="text"
                  value={draft.text}
                  onChange={(event) =>
                    updateDraft({
                      text: event.target.value,
                      client_id: "",
                      project_id: "",
                      deliverable_id: "",
                      deliverable_type: "",
                      time_taken_minutes: "",
                    })
                  }
                  onKeyDown={handleKeyDown}
                  placeholder="Acme Corp / The Last Mile / Rushing Waters / Carousel / 45m"
                  autoComplete="off"
                  spellCheck="false"
                  className="h-14 w-full rounded-xl border border-input bg-card px-4 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
                  aria-label="Quick work entry"
                />

                {suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
                    <div className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {currentStep === "client"
                        ? "Clients"
                        : currentStep === "project"
                        ? "Projects"
                        : currentStep === "deliverable"
                        ? "Deliverables"
                        : "Types"}
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1.5">
                      {suggestions.map((item, index) => {
                        const label =
                          typeof item === "string"
                            ? item
                            : currentStep === "project"
                            ? item.name
                            : item.name ||
                              item.deliverable_name ||
                              "Untitled deliverable";

                        return (
                          <button
                            key={typeof item === "string" ? item : item.id}
                            ref={(node) => {
                              suggestionRefs.current[index] = node;
                            }}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => selectSuggestion(item)}
                            className={[
                              "flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                              index === highlightedIndex
                                ? "bg-[#f0f0fd] text-[#1a1a8a]"
                                : "text-foreground hover:bg-muted",
                            ].join(" ")}
                          >
                            <span className="min-w-0 flex-1 truncate">{label}</span>
                            {index === highlightedIndex && (
                              <span className="ml-3 text-[10px] text-muted-foreground">
                                Enter
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  ["Client", resolvedClient?.name],
                  ["Project", resolvedProject?.name],
                  [
                    "Deliverable",
                    resolvedDeliverable?.name ||
                      resolvedDeliverable?.deliverable_name,
                  ],
                  ["Type", resolvedType],
                  ["Time", parsedDuration ? formatDuration(parsedDuration) : ""],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className={[
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs",
                      value
                        ? "border-[#dcdcf8] bg-[#f0f0fd] text-[#1a1a8a]"
                        : "border-border bg-muted text-muted-foreground",
                    ].join(" ")}
                  >
                    {value ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                    )}
                    <span className="font-medium">{label}</span>
                    {value && (
                      <span className="max-w-[220px] truncate">{value}</span>
                    )}
                  </div>
                ))}
              </div>

              {error && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {showRemark && (
                <div className="mt-4">
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Remark
                  </label>
                  <input
                    type="text"
                    value={draft.remarks}
                    onChange={(e) => updateDraft({ remarks: e.target.value })}
                    placeholder="Optional note..."
                    className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
                  />
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-medium text-muted-foreground">
                  Quick duration:
                </span>
                {DURATION_PRESETS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => setQuickDuration(minutes)}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                      parsedDuration === minutes
                        ? "border-[#2b2bb5] bg-[#f0f0fd] text-[#1a1a8a]"
                        : "border-border bg-card text-muted-foreground hover:border-[#dcdcf8] hover:bg-[#fafbff] hover:text-foreground",
                    ].join(" ")}
                  >
                    {formatDuration(minutes)}
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => setShowRemark((v) => !v)}
                  className="ml-auto rounded-lg px-3 py-1.5 text-xs font-medium text-[#2b2bb5] hover:bg-[#f0f0fd]"
                >
                  {showRemark ? "Hide remark" : "+ Add remark"}
                </button>
              </div>
            </section>

            {savedEntries.length > 0 && (
              <section>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Logged this session
                </div>
                <div className="space-y-2">
                  {savedEntries.map((entry, index) => (
                    <div
                      key={`${entry.project_id}-${entry.deliverable_id}-${entry.deliverable_type}-${index}`}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
                    >
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f0f0fd]">
                        <Check className="h-3.5 w-3.5 text-[#2b2bb5]" />
                      </div>
                      <div className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {clientMap.get(entry.client_id)?.name} /{" "}
                        {projectMap.get(entry.project_id)?.name} /{" "}
                        {entry.deliverable_name} / {entry.deliverable_type}
                      </div>
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
                        {formatDuration(entry.time_taken_minutes)}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-card px-6 py-4">
          <div className="text-xs text-muted-foreground">
            {savedEntries.length}{" "}
            {savedEntries.length === 1 ? "entry" : "entries"}
            <span className="hidden sm:inline">
              {" · "}↓/↑ navigate · Enter select/log · Cmd/Ctrl + Enter save
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
              disabled={saving || (!savedEntries.length && !draft.text.trim())}
              className="flex items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : `Save all (${savedEntries.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}