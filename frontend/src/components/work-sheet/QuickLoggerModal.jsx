import React, { useEffect, useRef, useState } from "react";
import { trackEvent } from "../../analytics";
import { getTimeDefaults } from "@/services/api";
import { clearQuickLogPreset, peekQuickLogPreset } from "@/lib/appActions";
import { lowTimeMessage } from "@/lib/timeRules";
import { NOT_AVAILABLE_OPTION, emptyDraft, formatDuration, fuzzyMatches } from "./quickLoggerLogic";
import { useQuickLoggerDerived } from "./useQuickLoggerDerived";
import { QuickLoggerFooter } from "./QuickLoggerFooter";
import { QuickLoggerEntries } from "./QuickLoggerEntries";
import { QuickLoggerEntryLine } from "./QuickLoggerEntryLine";
import { QuickLoggerHeader } from "./QuickLoggerHeader";

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

  const {
    stage,
    deliverableTypes,
    deliverableTypeCategories,
    projectMap,
    clientMap,
    resolvedClient,
    clientProjects,
    clientNameOf,
    lookalikes,
    resolvedProject,
    projectDeliverables,
    deliverableRequired,
    parts,
    resolvedDeliverable,
    resolvedType,
    typedDuration,
    benchmarkMinutes,
    durationIsAuto,
    parsedDuration,
    currentStep,
  } = useQuickLoggerDerived({ open, draft, currentUser, projects, deliverables, clients, options, timeDefaults });

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

  // Opened from a shared project link ("Log work"): start on that project.
  // Waits for the projects to arrive when the page has only just loaded.
  useEffect(() => {
    if (!open) return;
    const projectId = peekQuickLogPreset();
    const project = projectId ? projectMap.get(projectId) : null;
    if (!project) return;
    clearQuickLogPreset();
    const clientName = clientMap.get(project.client_id)?.name || "";
    setDraft({
      ...emptyDraft(),
      client_id: project.client_id || "",
      project_id: project.id,
      text: `${clientName} / ${project.name} / `,
    });
    setSuggestionsNonce((n) => n + 1);
  }, [open, projectMap, clientMap]);

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
    // Ignore OS/browser key auto-repeat for Enter (and Tab / Escape). Without
    // this, holding Enter even slightly longer than a tap can fire multiple
    // keydown events before React finishes clearing the input, which was
    // committing the same entry twice.
    //
    // Only the keys that act once per press are guarded. Backspace and the
    // arrow keys must keep auto-repeating: with every repeat swallowed,
    // holding Backspace deleted a single letter and stopped, so clearing a
    // long entry meant tapping it letter by letter.
    if (event.repeat && ["Enter", "Tab", "Escape"].includes(event.key)) {
      event.preventDefault();
      return;
    }

    // Backspace right after a field was picked ("Client / Project / ") removes
    // that whole field in one press and reopens its list, instead of eating
    // the separator and then the name one letter at a time. Holding the key,
    // or having a half-typed field, deletes letters as usual.
    if (
      event.key === "Backspace" &&
      !event.repeat &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.shiftKey
    ) {
      const input = event.currentTarget;
      const atEnd =
        input.selectionStart === input.value.length &&
        input.selectionEnd === input.value.length;
      const currentFieldEmpty = /\/\s*$/.test(draft.text);

      if (atEnd && currentFieldEmpty) {
        event.preventDefault();
        const withoutSeparator = draft.text.replace(/\s*\/\s*$/, "");
        const lastSeparator = withoutSeparator.lastIndexOf("/");
        updateDraft({
          text:
            lastSeparator === -1
              ? ""
              : `${withoutSeparator.slice(0, lastSeparator + 1)} `,
          client_id: "",
          project_id: "",
          deliverable_id: "",
          deliverable_type: "",
          time_taken_minutes: "",
        });
        setSuggestionsNonce((n) => n + 1);
        return;
      }
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


  const ctx = {
    benchmarkMinutes,
    chips,
    clientMap,
    clientNameOf,
    commitDraft,
    currentStep,
    draft,
    durationIsAuto,
    entryCardRef,
    error,
    handleClose,
    handleKeyDown,
    handleSave,
    highlightedIndex,
    inputRef,
    lookalikes,
    parsedDuration,
    projectMap,
    resolvedType,
    savedEntries,
    saving,
    selectSuggestion,
    setQuickDuration,
    setSavedEntries,
    setShowRemark,
    setSuggestionsNonce,
    showRemark,
    stepTitle,
    suggestionRefs,
    suggestions,
    totalMinutes,
    updateDraft,
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(12,12,13,0.1)] px-4 pt-[10dvh]">
      <div
        role="dialog"
        aria-label="Quick log"
        className="flex max-h-[calc(100dvh-10vh-16px)] w-[680px] max-w-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(234,238,244),0_15px_25px_rgba(13,28,61,0.12)]"
      >
        <QuickLoggerHeader {...ctx} />

        <QuickLoggerEntryLine {...ctx} />

        <QuickLoggerEntries {...ctx} />

        <QuickLoggerFooter {...ctx} />
      </div>
    </div>
  );
}