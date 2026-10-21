import { makeMatcher } from "@/lib/search";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { PROJECTS } from "@/constants/testIds";
import {
  PROJECT_STATUSES,
} from "@/constants/projectPalette";
import { checkProjectDuplicates, createProject } from "@/services/api";
import { useUser } from "@/context/UserContext";
import { trackEvent } from "../../analytics";
import {
  validateStageSchedule,
} from "@/components/projects/DeliverableFields";
import { AddClientModal } from "@/components/clients/AddClientModal";
import { findSimilarClients, findSimilarProjects } from "@/lib/lookalikes";

import { emptyDraftDeliverable, fmtDue, smallButton } from "@/components/projects/createProjectLogic";
import { CreateProjectFooter } from "@/components/projects/create/CreateProjectFooter";
import { CreateProjectDeliverables } from "@/components/projects/create/CreateProjectDeliverables";
import { CreateProjectExistingList } from "@/components/projects/create/CreateProjectExistingList";
import { CreateProjectMetaFields } from "@/components/projects/create/CreateProjectMetaFields";
import { CreateProjectNameNotices } from "@/components/projects/create/CreateProjectNameNotices";
import { CreateProjectNameFields } from "@/components/projects/create/CreateProjectNameFields";
import { CreateProjectClientPicker } from "@/components/projects/create/CreateProjectClientPicker";
import { CreateProjectHeader } from "@/components/projects/create/CreateProjectHeader";

// New project. Starts from the client (searchable, by name or initials, with
// "Add as a new client" when it isn't there yet), then checks the name as it
// is typed against existing projects - for this client first, then others -
// so the same project isn't created twice. A similar name must be confirmed
// as a new project, and gets a one-line description that tells the two apart
// wherever the team picks a project.
export const CreateProjectModal = ({
  open,
  onClose,
  onCreated,
  clients: clientList,
  projects = [],
  onClientsChanged,
  deliverableTypes,
}) => {
  const { currentUserId } = useUser();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [clientIndex, setClientIndex] = useState(0);
  const [addClientName, setAddClientName] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pocId, setPocId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState(PROJECT_STATUSES[0]);
  const [deliverables, setDeliverables] = useState([]);
  const [draftDeliverable, setDraftDeliverable] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  // A client added from here, until the page's refreshed list includes it.
  const [addedClient, setAddedClient] = useState(null);

  const clients = useMemo(
    () =>
      addedClient && !clientList.some((c) => c.id === addedClient.id)
        ? [...clientList, addedClient]
        : clientList,
    [clientList, addedClient]
  );

  const clientNames = useMemo(
    () => new Map(clients.map((c) => [c.id, c.name])),
    [clients]
  );
  const clientNameOf = (id) => clientNames.get(id) || "";

  const projectCounts = useMemo(() => {
    const counts = new Map();
    projects.forEach((p) => counts.set(p.client_id, (counts.get(p.client_id) || 0) + 1));
    return counts;
  }, [projects]);

  // Same client + same name made in the last 30 days, asked of the server because
  // it sees every project, not just the ones this page has loaded. It only
  // informs: it never changes whether the project can be created.
  // The answer is kept with the client and name it was asked for, so a result
  // for an earlier spelling is never shown against the current one.
  const [recentCheck, setRecentCheck] = useState({ key: "", list: [] });
  const checkedName = name.trim();
  const checkKey = `${clientId}|${checkedName}`;
  useEffect(() => {
    if (!open || !clientId || checkedName.length < 3) return undefined;
    let stale = false;
    const timer = setTimeout(() => {
      checkProjectDuplicates(currentUserId, clientId, checkedName)
        .then((data) => !stale && setRecentCheck({ key: checkKey, list: data?.duplicates || [] }))
        .catch(() => !stale && setRecentCheck({ key: checkKey, list: [] }));
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [open, clientId, checkedName, checkKey, currentUserId]);

  if (!open) return null;

  const selectedClient = clients.find((client) => client.id === clientId);
  const availablePocs = selectedClient?.contact_persons || [];

  // Client search: most-used clients when empty; otherwise names containing
  // the text, then look-alike names ("ABSL" finds Aditya Birla Sun Life MF).
  const q = clientQuery.trim().toLowerCase();
  const matchClient = makeMatcher(clientQuery);
  const clientOptions = (() => {
    if (!q) {
      return clients
        .filter((c) => c.status !== "Inactive")
        .sort((a, b) => (projectCounts.get(b.id) || 0) - (projectCounts.get(a.id) || 0))
        .slice(0, 6)
        .map((client) => ({ client, why: "" }));
    }
    const direct = clients
      .filter((c) => matchClient(c.name))
      .map((client) => ({ client, why: "" }));
    const fuzzy = findSimilarClients(clientQuery, clients)
      .filter((m) => !direct.some((d) => d.client.id === m.client.id))
      .map((m) => ({ client: m.client, why: m.why }));
    return [...direct, ...fuzzy].slice(0, 7);
  })();
  const exactClient = q && clients.some((c) => (c.name || "").trim().toLowerCase() === q);
  const showAddNewClient = !!q && !exactClient;
  const clientChoiceCount = clientOptions.length + (showAddNewClient ? 1 : 0);
  const activeClientIndex = Math.min(clientIndex, Math.max(0, clientChoiceCount - 1));

  const pickClient = (client) => {
    setClientId(client.id);
    setClientQuery("");
    setClientMenuOpen(false);
    setClientIndex(0);
    setPocId("");
    setConfirmed(false);
  };

  const clientMeta = (client, why) => {
    if (why) return why;
    const count = projectCounts.get(client.id) || 0;
    return `${count} ${count === 1 ? "project" : "projects"}${client.status === "Inactive" ? " · Inactive" : ""}`;
  };

  // Name check against existing projects.
  const trimmed = name.trim();
  const matches = findSimilarProjects(name, clientId, projects, clientNameOf);
  const exact = matches.find((m) => m.exact);
  const sameClientMatches = matches.filter((m) => m.same);
  const otherClientMatches = matches.filter((m) => !m.same);
  // Recent same-name projects the name check above has not already listed.
  const listedIds = new Set(matches.map((m) => m.project.id));
  const recentOnly = (recentCheck.key === checkKey ? recentCheck.list : []).filter(
    (d) => !listedIds.has(d.id)
  );
  const nameState = !trimmed
    ? "empty"
    : exact
      ? "exact"
      : matches.length
        ? "similar"
        : trimmed.length >= 3
          ? "clear"
          : "empty";
  const canCreate =
    !!selectedClient &&
    !!trimmed &&
    nameState !== "exact" &&
    (nameState !== "similar" || confirmed);

  const clientProjects = selectedClient
    ? projects.filter((p) => p.client_id === selectedClient.id)
    : [];

  const openProject = (project) => {
    onClose?.();
    navigate(`/projects/${project.id}`);
  };

  const openAddDeliverable = () => {
    setDraftDeliverable(emptyDraftDeliverable());
  };

  const openEditDeliverable = (d) => {
    setDraftDeliverable({ ...d });
  };

  const closeDraftDeliverable = () => {
    setDraftDeliverable(null);
  };

  const updateDraftField = (field, value) => {
    setDraftDeliverable((prev) => ({ ...prev, [field]: value }));
  };

  const toggleDraftStage = (stage) => {
    setDraftDeliverable((prev) => {
      const current = prev.required_stages || [];

      const next = current.includes(stage)
        ? current.filter((s) => s !== stage)
        : [...current, stage];

      return { ...prev, required_stages: next };
    });
  };

  const commitDraftDeliverable = () => {
    if (!draftDeliverable.name.trim()) {
      return toast.error("Deliverable name is required");
    }

    if (!draftDeliverable.required_stages?.length) {
      return toast.error("Select at least one production stage");
    }

    const scheduleError = validateStageSchedule(
      draftDeliverable.required_stages,
      draftDeliverable.stage_schedule
    );
    if (scheduleError) {
      return toast.error(scheduleError);
    }

    const saved = {
      ...draftDeliverable,
      id: draftDeliverable.id || crypto.randomUUID(),
      name: draftDeliverable.name.trim(),
    };

    setDeliverables((prev) => {
      const exists = prev.some((d) => d.id === saved.id);

      return exists
        ? prev.map((d) => (d.id === saved.id ? saved : d))
        : [...prev, saved];
    });

    setDraftDeliverable(null);
  };

  const removeDeliverable = (id) => {
    setDeliverables((prev) => prev.filter((d) => d.id !== id));
  };

  const reset = () => {
    setName("");
    setDescription("");
    setClientId("");
    setClientQuery("");
    setClientMenuOpen(false);
    setConfirmed(false);
    setPocId("");
    setStartDate("");
    setEndDate("");
    setStatus(PROJECT_STATUSES[0]);
    setDeliverables([]);
    setDraftDeliverable(null);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const handleSubmit = async () => {
    if (!canCreate || submitting) return;

    // Start and end dates are optional; only check the order when both are set.
    if (startDate && endDate && endDate < startDate) {
      return toast.error("End date must be after start date");
    }

    setSubmitting(true);

    try {
      const cleanedDeliverables = deliverables
        .filter((d) => d.name?.trim())
        .map(({ id, ...d }) => ({
          name: d.name.trim(),
          type: d.type || "",
          stage_schedule: d.stage_schedule || {},
          required_stages:
            d.required_stages?.length
              ? d.required_stages
              : ["Content"],
          approval_types:
            d.approval_types || [],
        }));

      const created = await createProject(currentUserId, {
        name: trimmed,
        description: description.trim(),
        client_id: clientId,
        poc_id: pocId || null,
        start_date: startDate || null,
        end_date: endDate || null,
        status,
        deliverables: cleanedDeliverables,
      });

      trackEvent("project_created", {
        project_id: created.id,
        status: created.status,
      });

      toast.success(`${created.name} created for ${selectedClient.name}`);

      reset();
      onCreated?.(created);
      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          "Failed to create project"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const nameUnderline =
    nameState === "exact"
      ? "shadow-[inset_0_-2px_0_#ef4444]"
      : nameState === "similar" || (nameState === "clear" && recentOnly.length > 0)
        ? "shadow-[inset_0_-2px_0_#f59e0b]"
        : nameState === "clear" && selectedClient
          ? "shadow-[inset_0_-2px_0_#10b981]"
          : "shadow-[inset_0_-1px_0_#eaeef4]";

  const createLabel = submitting
    ? "Creating..."
    : !selectedClient
      ? "Choose a client first"
      : !trimmed
        ? "Name the project"
        : nameState === "exact"
          ? "Project already exists"
          : nameState === "similar" && !confirmed
            ? "Confirm it’s a new project"
            : "Create project";

  const matchRow = (m) => (
    <div
      key={m.project.id}
      className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-3.5 py-2.5"
    >
      <span className="flex min-w-[220px] flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{m.project.name}</span>
          <span
            className={`rounded px-1.5 py-px text-[11px] font-medium ${
              m.exact
                ? "bg-red-50 text-red-700"
                : m.same
                  ? "bg-amber-100 text-amber-800"
                  : "bg-slate-100 text-slate-600"
            }`}
          >
            {m.exact ? "Already exists" : m.same ? "Same client" : "Other client"}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {[clientNameOf(m.project.client_id), m.project.code, m.project.status, fmtDue(m.project.end_date)]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <span className="text-xs text-slate-400">{m.why}</span>
      </span>
      <button type="button" className={smallButton} onClick={() => openProject(m.project)}>
        Open project
      </button>
    </div>
  );


  const ctx = {
    activeClientIndex,
    availablePocs,
    canCreate,
    clientChoiceCount,
    clientMenuOpen,
    clientMeta,
    clientOptions,
    clientProjects,
    clientQuery,
    closeDraftDeliverable,
    commitDraftDeliverable,
    confirmed,
    createLabel,
    deliverableTypes,
    deliverables,
    description,
    draftDeliverable,
    endDate,
    exact,
    handleClose,
    handleSubmit,
    matchRow,
    matches,
    name,
    nameState,
    nameUnderline,
    openAddDeliverable,
    openEditDeliverable,
    openProject,
    otherClientMatches,
    pickClient,
    pocId,
    projectCounts,
    q,
    recentOnly,
    removeDeliverable,
    sameClientMatches,
    selectedClient,
    setAddClientName,
    setClientId,
    setClientIndex,
    setClientMenuOpen,
    setClientQuery,
    setConfirmed,
    setDescription,
    setEndDate,
    setName,
    setPocId,
    setStartDate,
    setStatus,
    showAddNewClient,
    startDate,
    status,
    submitting,
    toggleDraftStage,
    updateDraftField,
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New project"
        data-testid={PROJECTS.modal}
        onKeyDown={(e) => {
          if (e.key === "Escape" && addClientName === null) handleClose();
        }}
        className="flex max-h-[calc(100dvh-48px)] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
      >
        <CreateProjectHeader {...ctx} />

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pb-6 pt-5 [&>*]:shrink-0">
          <CreateProjectClientPicker {...ctx} />

          <CreateProjectNameFields {...ctx} />

          <CreateProjectNameNotices {...ctx} />

          <CreateProjectMetaFields {...ctx} />

          <CreateProjectExistingList {...ctx} />

          <CreateProjectDeliverables {...ctx} />
        </div>

        <CreateProjectFooter {...ctx} />
      </div>

      <AddClientModal
        open={addClientName !== null}
        initialName={addClientName || ""}
        onClose={() => setAddClientName(null)}
        clients={clients}
        projects={projects}
        openLabel="Use this client"
        onOpenExisting={(client) => pickClient(client)}
        onSaved={(client) => {
          onClientsChanged?.();
          if (client?.id) {
            setAddedClient(client);
            pickClient(client);
          }
        }}
      />
    </div>
  );
};