import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Clock, Plus, Trash2, AlertCircle } from "lucide-react";
import { trackEvent } from "../../analytics";
import { getTimeDefaults } from "@/services/api";
import { lowTimeMessage } from "@/lib/timeRules";
import { buildLookalikeIndex, isProjectClosed } from "@/lib/lookalikes";
import { LookalikePill, ProjectNameParts } from "./ProjectPicker";
import {
  NOT_AVAILABLE_LABEL,
  NOT_AVAILABLE_VALUE,
} from "@/lib/deliverableRules";

// Shown as the last Deliverable suggestion. Shaped like a deliverable (id /
// name) so the suggestion list, chips and keyboard handling treat it the same
// way; `notAvailable` is what tells buildEntry to save the flag instead of an
// id.
const NOT_AVAILABLE_OPTION = {
  id: NOT_AVAILABLE_VALUE,
  name: NOT_AVAILABLE_LABEL,
  notAvailable: true,
};

const STAGE_BY_DEPARTMENT = {
  Content: "Content",
  Design: "Design",
  Animation: "Animate",
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

// No cap by default: the suggestion list scrolls (max-h-64), and cutting it to
// the first 8 hid most deliverables and types unless they were typed exactly.
const fuzzyMatches = (items, query, getLabel, limit = Infinity) => {
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
  const [timeDefaults, setTimeDefaults] = useState({});
  // Bumped to rebuild the suggestion list without anything typed: when the
  // logger opens, and when the input is clicked after the list was dismissed.
  const [suggestionsNonce, setSuggestionsNonce] = useState(0);

  // The logged-in person's minutes-per-unit for each Core activity. A failure
  // is harmless: durations just have to be typed, as before.
  useEffect(() => {
    if (!open || !currentUser?.id) return undefined;
    let cancelled = false;
    getTimeDefaults(currentUser.id)
      .then((data) => !cancelled && setTimeDefaults(data?.defaults || {}))
      .catch(() => !cancelled && setTimeDefaults({}));
    return () => {
      cancelled = true;
    };
  }, [open, currentUser?.id]);
  const inputRef = useRef(null);
  const entryCardRef = useRef(null);
  const suggestionRefs = useRef([]);
  const committingRef = useRef(false);
  const entryStartedRef = useRef(false);
  const savedSuccessfullyRef = useRef(false);

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

  // Client and Project always sit at fixed positions 0/1 in the typed
  // text, followed by Deliverable, Type and Time. Deliverable is always
  // asked for once a project is chosen: when the project has none (or
  // the right one isn't there yet) the user picks "Not available", which
  // tells the admins to add it, instead of skipping the field.
  const clientProjectParts = useMemo(() => {
    const values = draft.text.split("/");
    return {
      client: (values[0] || "").trim(),
      project: (values[1] || "").trim(),
    };
  }, [draft.text]);

  const resolvedClient = useMemo(() => {
    if (draft.client_id) return clientMap.get(draft.client_id) || null;
    return (
      clients.find(
        (c) => normalise(c.name) === normalise(clientProjectParts.client)
      ) || null
    );
  }, [draft.client_id, clientMap, clients, clientProjectParts.client]);

  // Delivered and scrapped projects are left out: no new work is logged
  // against them (same rule as the Work Sheet's Project picker).
  const clientProjects = useMemo(
    () =>
      resolvedClient
        ? projects.filter(
            (p) => p.client_id === resolvedClient.id && !isProjectClosed(p)
          )
        : [],
    [projects, resolvedClient]
  );

  const clientNameOf = useCallback(
    (clientId) => clientMap.get(clientId)?.name || "",
    [clientMap]
  );

  // Look-alike names among the projects on offer, flagged in the Project
  // suggestions with the words that tell them apart in bold.
  const lookalikes = useMemo(
    () =>
      open
        ? buildLookalikeIndex(projects.filter((p) => !isProjectClosed(p)), clientNameOf)
        : new Map(),
    [open, projects, clientNameOf]
  );

  const resolvedProject = useMemo(() => {
    if (draft.project_id) return projectMap.get(draft.project_id) || null;
    return (
      clientProjects.find(
        (p) => normalise(p.name) === normalise(clientProjectParts.project)
      ) || null
    );
  }, [draft.project_id, projectMap, clientProjects, clientProjectParts.project]);

  const projectDeliverables = useMemo(
    () => (resolvedProject ? deliverablesByProject.get(resolvedProject.id) || [] : []),
    [deliverablesByProject, resolvedProject]
  );

  // A deliverable (or "Not available") is required for every entry once a
  // project is chosen. "Not available" is always offered, so a project with
  // no deliverables never leaves the user stuck.
  const deliverableRequired = Boolean(resolvedProject);

  const parts = useMemo(() => {
    const values = draft.text.split("/").map((v) => (v || "").trim());

    if (deliverableRequired) {
      return {
        client: clientProjectParts.client,
        project: clientProjectParts.project,
        deliverable: values[2] || "",
        type: values[3] || "",
        duration: values[4] || "",
      };
    }

    return {
      client: clientProjectParts.client,
      project: clientProjectParts.project,
      deliverable: "",
      type: values[2] || "",
      duration: values[3] || "",
    };
  }, [draft.text, deliverableRequired, clientProjectParts]);

  const resolvedDeliverable = useMemo(() => {
    if (!deliverableRequired) return null;
    if (draft.deliverable_id === NOT_AVAILABLE_VALUE) {
      return NOT_AVAILABLE_OPTION;
    }
    if (draft.deliverable_id) {
      return deliverables.find((d) => d.id === draft.deliverable_id) || null;
    }
    // Typed text: a real deliverable with that name wins, then "Not available".
    return (
      projectDeliverables.find(
        (d) =>
          normalise(d.name || d.deliverable_name) ===
          normalise(parts.deliverable)
      ) ||
      (normalise(parts.deliverable) === normalise(NOT_AVAILABLE_LABEL)
        ? NOT_AVAILABLE_OPTION
        : null)
    );
  }, [
    deliverableRequired,
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

  // Time is required, but when nothing has been typed it is filled from this
  // person's own benchmark for the chosen type (their efficiency target). A
  // typed duration always wins, so edge cases stay editable.
  const typedDurationText = draft.time_taken_minutes || parts.duration;
  const typedDuration = parseDuration(typedDurationText);
  const benchmarkMinutes = resolvedType
    ? Number(timeDefaults[resolvedType]) || 0
    : 0;
  const durationIsAuto = !typedDurationText && benchmarkMinutes > 0;
  const parsedDuration = typedDuration || (durationIsAuto ? benchmarkMinutes : null);

  const currentStep = useMemo(() => {
    if (!draft.text.trim()) return "client";
    if (!resolvedClient) return "client";
    if (!resolvedProject) return "project";
    if (deliverableRequired && !resolvedDeliverable) return "deliverable";
    if (!resolvedType) return "type";
    if (!parsedDuration || parsedDuration <= 0) return "duration";
    return "complete";
  }, [
    draft.text,
    deliverableRequired,
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
    // The modal stays mounted while closed, so on reopening nothing the
    // suggestion effect depends on has changed and it would not run again:
    // the Clients list only appeared once something was typed or clicked.
    setSuggestionsNonce((n) => n + 1);

    entryStartedRef.current = false;
    savedSuccessfullyRef.current = false;

    trackEvent("quick_logger_opened", {
      source: "worksheet",
      stage: stage || null,
    });

    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Clicking anywhere outside the input/suggestions (but still inside the
  // modal — e.g. the logged-entries list, the quick-duration buttons, or
  // just empty space) previously left the dropdown stuck open with
  // nothing to dismiss it short of retyping. This dismisses it on any
  // outside click without closing the whole modal.
  useEffect(() => {
    if (!open || !suggestions.length) return;

    const handlePointerDown = (event) => {
      if (!entryCardRef.current?.contains(event.target)) {
        setSuggestions([]);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open, suggestions.length]);

  useEffect(() => {
    if (!open) return;
    const step = currentStep;
    let next = [];

    if (step === "client") {
      next = fuzzyMatches(clients, parts.client, (c) => c.name);
    } else if (step === "project") {
      next = fuzzyMatches(clientProjects, parts.project, (p) => p.name);
    } else if (step === "deliverable") {
      next = [
        ...fuzzyMatches(
          projectDeliverables,
          parts.deliverable,
          (d) => d.name || d.deliverable_name || "Untitled deliverable"
        ),
        // Last on purpose: people should look for the real deliverable first.
        ...fuzzyMatches([NOT_AVAILABLE_OPTION], parts.deliverable, (d) => d.name),
      ];
    } else if (step === "type") {
      next = fuzzyMatches(deliverableTypes, parts.type, (t) => t);
    }

    setSuggestions(next);
    setHighlightedIndex(0);
  }, [
    open,
    suggestionsNonce,
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
    setDraft((prev) => {
      const next = { ...prev, ...patch };

      const hasStartedEntry =
        Boolean(next.text?.trim()) ||
        Boolean(next.client_id) ||
        Boolean(next.project_id) ||
        Boolean(next.deliverable_id) ||
        Boolean(next.deliverable_type) ||
        Boolean(next.time_taken_minutes);

      if (hasStartedEntry && !entryStartedRef.current) {
        entryStartedRef.current = true;

        trackEvent("quick_logger_entry_started", {
          source: "worksheet",
          stage: stage || null,
        });
      }

      return next;
    });

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

      trackEvent("quick_logger_project_selected", {
        project_id: item.id,
        stage: stage || null,
      });
    } else if (currentStep === "deliverable") {
      const name = item.name || item.deliverable_name || "";
      updateDraft({
        deliverable_id: item.id,
        deliverable_type: "",
        time_taken_minutes: "",
        text: `${parts.client} / ${parts.project} / ${name} / `,
      });

      trackEvent(
        item.notAvailable
          ? "quick_logger_deliverable_not_available"
          : "quick_logger_deliverable_selected",
        {
          project_id: resolvedProject?.id || null,
          deliverable_id: item.notAvailable ? null : item.id,
          stage: stage || null,
        }
      );
    } else if (currentStep === "type") {
      updateDraft({
        deliverable_type: item,
        time_taken_minutes: "",
        text: deliverableRequired
          ? `${parts.client} / ${parts.project} / ${parts.deliverable} / ${item} / `
          : `${parts.client} / ${parts.project} / ${item} / `,
      });
    }

    setHighlightedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const buildEntry = () => {
    if (
      !resolvedClient ||
      !resolvedProject ||
      (deliverableRequired && !resolvedDeliverable) ||
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
      // "Not available" has no id: it is saved as a flag, and the backend
      // notifies the admins to add the missing deliverable.
      deliverable_id: resolvedDeliverable?.notAvailable
        ? null
        : resolvedDeliverable?.id || null,
      deliverable_not_available: Boolean(resolvedDeliverable?.notAvailable),
      deliverable_name: resolvedDeliverable?.notAvailable
        ? ""
        : resolvedDeliverable?.name ||
          resolvedDeliverable?.deliverable_name ||
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
          ? "Select a Deliverable (or Not available) for this Project."
          : currentStep === "type"
          ? "Select a Type."
          : "Enter a valid Duration, such as 45m or 1h."
      );
      return false;
    }

    // A typed duration far below this person's benchmark for the type is
    // refused (same rule the server applies). Durations filled from the
    // benchmark are never flagged.
    if (typedDuration && !durationIsAuto) {
      const lowTime = lowTimeMessage(typedDuration, benchmarkMinutes, resolvedType);
      if (lowTime) {
        setError(lowTime);
        return false;
      }
    }

    committingRef.current = true;

    setSavedEntries((prev) => {
      const nextEntries = [entry, ...prev];

      trackEvent("quick_logger_entry_added", {
        entry_count: nextEntries.length,
        duration_minutes: entry.time_taken_minutes,
        stage: stage || null,
      });

      return nextEntries;
    });

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
        deliverable_not_available: Boolean(entry.deliverable_not_available),
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

      const durationTotalMinutes = entriesToSave.reduce(
        (total, entry) => total + Number(entry.time_taken_minutes || 0),
        0
      );

      trackEvent("quick_logger_saved", {
        entry_count: entriesToSave.length,
        duration_total_minutes: durationTotalMinutes,
        stage: stage || null,
      });

      savedSuccessfullyRef.current = true;

      setDraft(emptyDraft());
      setSavedEntries([]);
      onClose();
    } catch (saveError) {
      console.error("Quick Logger save failed:", saveError);

      trackEvent("quick_logger_save_failed", {
        entry_count: entriesToSave.length,
        stage: stage || null,
      });

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
      handleClose();
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
          ? "Select a Deliverable (or Not available) for this Project."
          : currentStep === "type"
          ? "Select a Type."
          : "Enter a valid Duration, such as 45m or 1h."
      );
      return;
    }
  };

  const setQuickDuration = (minutes) => {
    const value = deliverableRequired
      ? `${parts.client} / ${parts.project} / ${parts.deliverable} / ${parts.type} / ${formatDuration(minutes)}`
      : `${parts.client} / ${parts.project} / ${parts.type} / ${formatDuration(minutes)}`;
    updateDraft({
      text: value,
      time_taken_minutes: minutes,
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleClose = () => {
    if (!savedSuccessfullyRef.current) {
      trackEvent("quick_logger_closed", {
        entry_count: savedEntries.length,
        has_draft: Boolean(draft.text.trim()),
        stage: stage || null,
      });
    }

    onClose();
  };

  if (!open) return null;

  const stepTitle =
    currentStep === "client"
      ? "Clients"
      : currentStep === "project"
      ? "Projects"
      : currentStep === "deliverable"
      ? "Deliverables"
      : "Types";

  const chips = [
    ["Client", resolvedClient?.name],
    ["Project", resolvedProject?.name],
    ["Deliverable", resolvedDeliverable?.name || resolvedDeliverable?.deliverable_name],
    ["Type", resolvedType],
    [
      "Time",
      parsedDuration ? `${formatDuration(parsedDuration)}${durationIsAuto ? " (auto)" : ""}` : "",
    ],
  ];

  const totalMinutes = savedEntries.reduce(
    (total, entry) => total + Number(entry.time_taken_minutes || 0),
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(12,12,13,0.1)] px-4 pt-[10vh]">
      <div
        role="dialog"
        aria-label="Quick log"
        className="flex max-h-[calc(100vh-10vh-16px)] w-[680px] max-w-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(234,238,244),0_15px_25px_rgba(13,28,61,0.12)]"
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 pt-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0f0fd] text-[#2b2bb5]">
            <Clock className="h-4 w-4" />
          </span>
          <h2 className="flex-1 text-base font-semibold text-foreground">Quick log</h2>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Entry line */}
        <div ref={entryCardRef} className="flex flex-col gap-2.5 px-5 pb-4 pt-3.5">
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
              onClick={() => {
                if (!suggestions.length) setSuggestionsNonce((n) => n + 1);
              }}
              placeholder="Client / Project / Deliverable / Type / Time"
              autoComplete="off"
              spellCheck="false"
              className="h-11 w-full rounded-lg border-none bg-white px-3.5 text-[15px] text-foreground shadow-[inset_0_0_0_1px_#2b2bb5,0_0_0_3px_#dcdcf8] outline-none placeholder:text-muted-foreground"
              aria-label="Quick work entry"
            />

            {suggestions.length > 0 && (
              <div
                role="listbox"
                className="absolute inset-x-0 top-[50px] z-20 rounded-[10px] bg-white p-1 shadow-[0_0_0_1px_rgb(234,238,244),0_6px_15px_rgba(13,28,61,0.08)]"
              >
                <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase leading-[14px] tracking-[0.05em] text-muted-foreground">
                  {stepTitle}
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {suggestions.map((item, index) => {
                    const label =
                      typeof item === "string"
                        ? item
                        : currentStep === "project"
                        ? item.name
                        : item.name || item.deliverable_name || "Untitled deliverable";

                    return (
                      <button
                        key={typeof item === "string" ? item : item.id}
                        ref={(node) => {
                          suggestionRefs.current[index] = node;
                        }}
                        type="button"
                        role="option"
                        aria-selected={index === highlightedIndex}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSuggestion(item)}
                        className={[
                          "flex min-h-8 w-full items-start gap-2 rounded-[7px] px-2.5 py-1 text-left text-[13px] transition-colors",
                          index === highlightedIndex
                            ? "bg-[#f0f0fd] text-foreground"
                            : "text-foreground hover:bg-[#f0f0fd]",
                        ].join(" ")}
                      >
                        {currentStep === "project" ? (
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="whitespace-normal break-words">
                              <ProjectNameParts
                                project={item}
                                twins={lookalikes.get(item.id) || []}
                                clientNameOf={clientNameOf}
                              />
                            </span>
                            {item.description && (
                              <span className="whitespace-normal break-words text-xs leading-4 text-slate-600">
                                {item.description}
                              </span>
                            )}
                            {lookalikes.has(item.id) && <LookalikePill />}
                          </span>
                        ) : (
                          <span className="min-w-0 flex-1 self-center whitespace-normal break-words">
                            {label}
                          </span>
                        )}
                        {index === highlightedIndex && (
                          <span className="self-center text-[11px] text-muted-foreground">Enter</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* What has been understood so far */}
          <div className="flex flex-wrap gap-1.5">
            {chips.map(([label, value]) => (
              <span
                key={label}
                title={value ? `${label}: ${value}` : label}
                className={[
                  "inline-flex h-[26px] max-w-[200px] items-center gap-1.5 rounded-full px-2.5 text-xs",
                  value
                    ? "bg-[#f0f0fd] text-[#1a1a8a] shadow-[inset_0_0_0_1px_#dcdcf8]"
                    : "bg-white text-muted-foreground shadow-[inset_0_0_0_1px_rgb(226,232,240)]",
                ].join(" ")}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    value ? "bg-[#2b2bb5]" : "bg-slate-300"
                  }`}
                />
                <span className="truncate">{value || label}</span>
              </span>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {showRemark && (
            <input
              type="text"
              value={draft.remarks}
              onChange={(e) => updateDraft({ remarks: e.target.value })}
              placeholder="Remark (optional)"
              aria-label="Remark"
              className="h-9 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
            />
          )}

          {durationIsAuto && (
            <p className="text-xs text-[#2b2bb5]">
              Time filled from your benchmark for {resolvedType} ({formatDuration(benchmarkMinutes)}).
              Type a duration, or pick one below, to change it.
            </p>
          )}

          {/* Duration presets + add */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-muted-foreground">Duration</span>
            {DURATION_PRESETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => setQuickDuration(minutes)}
                className={[
                  "h-[26px] rounded-[7px] px-2.5 text-xs font-medium transition-colors",
                  parsedDuration === minutes
                    ? "bg-[#f0f0fd] text-[#1a1a8a] shadow-[inset_0_0_0_1px_#2b2bb5]"
                    : "bg-white text-slate-700 shadow-[inset_0_0_0_1px_rgb(226,232,240)] hover:bg-[#f0f0fd]",
                ].join(" ")}
              >
                {formatDuration(minutes)}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setShowRemark((v) => !v)}
              className="ml-1 h-[26px] rounded-[7px] px-2 text-xs font-medium text-[#2b2bb5] hover:bg-[#f0f0fd]"
            >
              {showRemark ? "Hide remark" : "+ Remark"}
            </button>

            <span className="flex-1" />

            <button
              type="button"
              onClick={() => commitDraft()}
              disabled={!draft.text.trim()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#f0f0fd] px-3 text-[13px] font-semibold text-[#2b2bb5] transition-colors hover:bg-[#dcdcf8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add entry
            </button>
          </div>
        </div>

        {/* Entries collected so far */}
        <div className="max-h-[260px] min-h-[120px] overflow-y-auto bg-[#f7f9fc] shadow-[inset_0_1px_0_rgb(234,238,244)]">
          {savedEntries.length === 0 ? (
            <div className="px-5 py-7 text-center text-[13px] leading-5 text-muted-foreground">
              Type one line per task and press Enter.
              <br />
              Entries collect here until you save them.
            </div>
          ) : (
            savedEntries.map((entry, index) => (
              <div
                key={`${entry.project_id}-${entry.deliverable_id}-${entry.deliverable_type}-${index}`}
                className="flex items-center gap-3 px-5 py-2.5 text-[13px] shadow-[inset_0_-1px_0_rgb(234,238,244)]"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium text-foreground">
                    {entry.deliverable_not_available
                      ? NOT_AVAILABLE_LABEL
                      : entry.deliverable_name || entry.deliverable_type}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {[
                      clientMap.get(entry.client_id)?.name,
                      projectMap.get(entry.project_id)?.name,
                      entry.deliverable_type,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {formatDuration(entry.time_taken_minutes)}
                </span>
                <button
                  type="button"
                  aria-label="Remove entry"
                  onClick={() =>
                    setSavedEntries((prev) => prev.filter((_, i) => i !== index))
                  }
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-muted-foreground transition-colors hover:bg-slate-200"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3 shadow-[inset_0_1px_0_rgb(234,238,244)]">
          <span className="flex-1 text-xs text-muted-foreground">
            {savedEntries.length === 0
              ? "No entries yet"
              : `${savedEntries.length} ${savedEntries.length === 1 ? "entry" : "entries"} · ${formatDuration(totalMinutes)}`}
            <span className="hidden sm:inline">
              {" · "}↓/↑ navigate · Enter select/log · Cmd/Ctrl + Enter save
            </span>
          </span>
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="h-9 rounded-lg px-3.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (!savedEntries.length && !draft.text.trim())}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1a1a8a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : savedEntries.length ? `Save ${savedEntries.length}` : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
