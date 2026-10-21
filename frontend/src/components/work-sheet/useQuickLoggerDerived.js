import { useCallback, useMemo } from "react";
import { buildLookalikeIndex } from "@/lib/lookalikes";
import { NOT_AVAILABLE_LABEL, NOT_AVAILABLE_VALUE } from "@/lib/deliverableRules";
import { NOT_AVAILABLE_OPTION, STAGE_BY_DEPARTMENT, normalise, parseDuration } from "./quickLoggerLogic";

// Everything the Quick Logger works out from what has been typed so far:
// the chosen client / project / deliverable / type / duration and which step
// the entry line is on.
export function useQuickLoggerDerived({ open, draft, currentUser, projects, deliverables, clients, options, timeDefaults }) {
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
            (p) => p.client_id === resolvedClient.id
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
        ? buildLookalikeIndex(projects, clientNameOf)
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

  return {
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
  };
}
