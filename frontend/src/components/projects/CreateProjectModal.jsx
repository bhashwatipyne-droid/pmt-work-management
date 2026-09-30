import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  X,
  Plus,
  Trash2,
  Pencil,
  ChevronRight,
  Briefcase,
  Package,
  Search,
  Check,
  AlertCircle,
} from "lucide-react";

import { PROJECTS } from "@/constants/testIds";
import {
  PROJECT_STATUSES,
  PROJECT_STATUS_STYLE,
  STAGE_COLORS,
} from "@/constants/projectPalette";
import { createProject } from "@/services/api";
import { useUser } from "@/context/UserContext";
import { trackEvent } from "../../analytics";
import {
  DeliverableFields,
  validateStageSchedule,
} from "@/components/projects/DeliverableFields";
import { AddClientModal } from "@/components/clients/AddClientModal";
import { findSimilarClients, findSimilarProjects } from "@/lib/lookalikes";
import { getInitials } from "@/lib/contacts";

const emptyDraftDeliverable = () => ({
  id: null,
  name: "",
  type: "",
  stage_schedule: {},
  required_stages: ["Content"],
  approval_types: [],
});

const fieldBase =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-white px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const smallButton =
  "inline-flex h-7 items-center whitespace-nowrap rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-foreground hover:bg-slate-50";

const fmtDue = (date) => {
  if (!date) return "no end date";
  try {
    return `due ${format(parseISO(date), "dd MMM yyyy")}`;
  } catch {
    return `due ${date}`;
  }
};

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

  if (!open) return null;

  const selectedClient = clients.find((client) => client.id === clientId);
  const availablePocs = selectedClient?.contact_persons || [];

  // Client search: most-used clients when empty; otherwise names containing
  // the text, then look-alike names ("ABSL" finds Aditya Birla Sun Life MF).
  const q = clientQuery.trim().toLowerCase();
  const clientOptions = (() => {
    if (!q) {
      return clients
        .filter((c) => c.status !== "Inactive")
        .sort((a, b) => (projectCounts.get(b.id) || 0) - (projectCounts.get(a.id) || 0))
        .slice(0, 6)
        .map((client) => ({ client, why: "" }));
    }
    const direct = clients
      .filter((c) => (c.name || "").toLowerCase().includes(q))
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
      : nameState === "similar"
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
        className="flex max-h-[calc(100vh-48px)] w-full max-w-[820px] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
      >
        {/* Header: breadcrumb + close */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-6 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0f0fd] text-[#2b2bb5]">
            <Briefcase className="h-4 w-4" />
          </span>
          <span className="flex flex-1 items-center gap-1.5 text-sm text-muted-foreground">
            Projects
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <span className="font-semibold text-foreground">New project</span>
          </span>
          <button
            type="button"
            data-testid={PROJECTS.modalClose}
            onClick={handleClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-6 pb-6 pt-5 [&>*]:shrink-0">
          {/* Client */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-700">Client</span>
            {selectedClient ? (
              <div className="flex items-center gap-2.5 rounded-[10px] border border-slate-200 py-2 pl-2.5 pr-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#f0f0fd] text-[11px] font-semibold text-[#1a1a8a]">
                  {getInitials(selectedClient.name)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="text-sm font-semibold text-foreground">{selectedClient.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {projectCounts.get(selectedClient.id) || 0} projects · {availablePocs.length} POCs
                  </span>
                </span>
                <button
                  type="button"
                  data-testid={PROJECTS.fieldClient}
                  className={smallButton}
                  onClick={() => {
                    setClientId("");
                    setClientMenuOpen(true);
                    setPocId("");
                  }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                {clientMenuOpen && (
                  <div className="fixed inset-0 z-[1]" onMouseDown={() => setClientMenuOpen(false)} />
                )}
                <label className="relative z-[2] flex h-10 items-center gap-2 rounded-[10px] border border-[#2b2bb5] bg-white px-3 text-muted-foreground ring-[3px] ring-[#2b2bb5]/15">
                  <Search className="h-3.5 w-3.5" />
                  <input
                    autoFocus
                    role="combobox"
                    aria-expanded={clientMenuOpen}
                    aria-label="Search client"
                    data-testid={PROJECTS.fieldClient}
                    value={clientQuery}
                    onChange={(e) => {
                      setClientQuery(e.target.value);
                      setClientMenuOpen(true);
                      setClientIndex(0);
                    }}
                    onFocus={() => setClientMenuOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setClientMenuOpen(true);
                        setClientIndex(Math.min(activeClientIndex + 1, clientChoiceCount - 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setClientIndex(Math.max(activeClientIndex - 1, 0));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (activeClientIndex < clientOptions.length) {
                          pickClient(clientOptions[activeClientIndex].client);
                        } else if (showAddNewClient) {
                          setAddClientName(clientQuery.trim());
                          setClientMenuOpen(false);
                        }
                      } else if (e.key === "Escape" && clientMenuOpen) {
                        e.stopPropagation();
                        setClientMenuOpen(false);
                      }
                    }}
                    placeholder="Search client by name or short name, e.g. ABSL"
                    className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
                  />
                </label>
                {clientMenuOpen && (
                  <div
                    role="listbox"
                    className="absolute left-0 right-0 top-[calc(100%+6px)] z-[3] flex max-h-80 flex-col gap-px overflow-auto rounded-xl border border-border bg-white p-1.5 shadow-lg"
                  >
                    <span className="px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                      {q ? "Matching clients" : "Most used clients"}
                    </span>
                    {clientOptions.map(({ client, why }, i) => (
                      <button
                        key={client.id}
                        type="button"
                        role="option"
                        aria-selected={i === activeClientIndex}
                        onClick={() => pickClient(client)}
                        className={`flex min-h-10 items-center gap-2.5 rounded-md px-2 py-1 text-left hover:bg-[#f0f0fd] ${
                          i === activeClientIndex ? "bg-[#f0f0fd]" : ""
                        }`}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#f0f0fd] text-[10px] font-semibold text-[#1a1a8a]">
                          {getInitials(client.name)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{client.name}</span>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {clientMeta(client, why)}
                        </span>
                      </button>
                    ))}
                    {clientOptions.length === 0 && (
                      <span className="px-2 py-2.5 text-[13px] text-muted-foreground">
                        No existing client matches. Check the spelling or add it below.
                      </span>
                    )}
                    {showAddNewClient && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddClientName(clientQuery.trim());
                          setClientMenuOpen(false);
                        }}
                        className={`mt-1 flex min-h-10 items-center gap-2.5 rounded-md border-t border-border px-2 py-1 text-left text-[13px] font-semibold text-[#2b2bb5] hover:bg-[#f0f0fd] ${
                          activeClientIndex === clientOptions.length ? "bg-[#f0f0fd]" : ""
                        }`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add “{clientQuery.trim()}” as a new client
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Name */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-700">Project name</span>
            <input
              data-testid={PROJECTS.fieldName}
              aria-label="Project name"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setConfirmed(false);
              }}
              placeholder="e.g. Senior Citizen Campaign"
              className={`h-12 border-none bg-transparent px-0.5 text-2xl font-semibold tracking-tight text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 ${nameUnderline}`}
            />
          </label>

          {/* Description */}
          <label className="-mt-1.5 flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-700">What is this project for?</span>
            <input
              aria-label="Project description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="One line the team will see when picking a project, e.g. Oct 2026 edition, Gujarati versions"
              className={fieldBase}
            />
            {nameState === "similar" && (
              <span className="text-xs text-amber-800">
                A similar project exists. Add what makes this one different, like the year, language or product.
              </span>
            )}
          </label>

          {nameState === "clear" && selectedClient && (
            <div className="-mt-2 flex items-center gap-2 text-[13px] text-emerald-800">
              <Check className="h-3.5 w-3.5" />
              No similar project for {selectedClient.name} or other clients.
            </div>
          )}

          {matches.length > 0 && (
            <div className="-mt-1.5 flex flex-col overflow-hidden rounded-xl border border-border">
              {exact ? (
                <div className="flex items-start gap-2.5 bg-red-50 px-3.5 py-3 text-[13px] leading-[18px]">
                  <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-500" />
                  <span className="text-foreground">
                    <strong className="font-semibold">This project already exists for this client.</strong>{" "}
                    Open it and add deliverables there.
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-2.5 bg-amber-100 px-3.5 py-3 text-[13px] leading-[18px]">
                  <AlertCircle className="mt-px h-4 w-4 shrink-0 text-amber-800" />
                  <span className="text-foreground">
                    <strong className="font-semibold">Similar projects found.</strong> Check these before
                    creating a new one.
                  </span>
                </div>
              )}
              {sameClientMatches.length > 0 && (
                <>
                  <span className="px-3.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Same client
                  </span>
                  {sameClientMatches.map(matchRow)}
                </>
              )}
              {otherClientMatches.length > 0 && (
                <>
                  <span className="px-3.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Other clients
                  </span>
                  {otherClientMatches.map(matchRow)}
                </>
              )}
              {!exact && (
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={confirmed}
                  onClick={() => setConfirmed((v) => !v)}
                  className="flex items-center gap-2.5 border-t border-border bg-slate-50 px-3.5 py-3 text-left text-[13px] text-foreground"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${
                      confirmed ? "bg-[#2b2bb5] text-white" : "border border-slate-300 bg-white"
                    }`}
                  >
                    {confirmed && <Check className="h-3 w-3" />}
                  </span>
                  None of these. This is a new project.
                </button>
              )}
            </div>
          )}

          {/* Status / POC / dates */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-700">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldBase}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-700">
              Point of contact
              <select
                value={pocId}
                onChange={(e) => setPocId(e.target.value)}
                disabled={!selectedClient}
                className={fieldBase}
              >
                <option value="">
                  {!selectedClient ? "Choose a client first" : availablePocs.length ? "Choose POC" : "No POCs yet"}
                </option>
                {availablePocs.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-700">
              Start date
              <input
                type="date"
                data-testid={PROJECTS.fieldStart}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={fieldBase}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-700">
              End date
              <input
                type="date"
                data-testid={PROJECTS.fieldEnd}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={fieldBase}
              />
            </label>
          </div>

          {/* The client's projects, while no name is typed yet */}
          {selectedClient && nameState === "empty" && (
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-foreground">
                Existing projects for {selectedClient.name} · {clientProjects.length}
              </span>
              {clientProjects.length ? (
                <div className="flex flex-col overflow-hidden rounded-[10px] border border-border">
                  {clientProjects.slice(0, 5).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openProject(p)}
                      className="flex min-h-10 items-center gap-2.5 border-b border-slate-100 bg-white px-3 text-left last:border-b-0 hover:bg-slate-50"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: PROJECT_STATUS_STYLE[p.status]?.dot || "#8a93a2" }}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{p.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.status} · {fmtDue(p.end_date)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-[13px] text-muted-foreground">No projects yet for this client.</span>
              )}
            </div>
          )}

          {/* Deliverables */}
          <div className="rounded-xl border border-border bg-[#f7f9fc]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Deliverables ({deliverables.length})
                </h3>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  Optional. Break the project into deliverables to track progress.
                </p>
              </div>

              {!draftDeliverable && (
                <button
                  type="button"
                  data-testid={PROJECTS.addDeliverableBtn}
                  onClick={openAddDeliverable}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add deliverable
                </button>
              )}
            </div>

            {/* Inline create/edit card — no modal-over-modal */}
            {draftDeliverable && (
              <div className="border-b border-border bg-white p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {draftDeliverable.id ? "Edit deliverable" : "Create deliverable"}
                </p>

                <DeliverableFields
                  deliverable={draftDeliverable}
                  onChange={updateDraftField}
                  onToggleStage={toggleDraftStage}
                  deliverableTypes={deliverableTypes}
                  autoFocusName
                  compact
                />

                <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={closeDraftDeliverable}
                    className="rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={commitDraftDeliverable}
                    className="rounded-lg bg-[#2b2bb5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30"
                  >
                    {draftDeliverable.id ? "Save changes" : "Add deliverable"}
                  </button>
                </div>
              </div>
            )}

            {deliverables.length === 0 && !draftDeliverable ? (
              <div className="flex flex-col items-center justify-center px-5 py-6 text-center">
                <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-muted-foreground">
                  <Package className="h-4 w-4" />
                </span>

                <p className="text-sm font-semibold text-foreground">
                  No deliverables added yet
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  You can also add them later from the project page.
                </p>
              </div>
            ) : (
              deliverables.length > 0 && (
                <div className="divide-y divide-border rounded-b-xl bg-white">
                  {deliverables.map((d) => (
                    <div
                      key={d.id}
                      data-testid={`${PROJECTS.deliverableRowPrefix}-${d.id}`}
                      className="flex items-center justify-between gap-3 px-5 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate text-sm font-semibold text-foreground">
                            {d.name}
                          </span>

                          {d.type && (
                            <span className="text-xs text-muted-foreground">
                              · {d.type}
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {(d.required_stages || []).map((stage) => (
                              <span
                                key={stage}
                                className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    STAGE_COLORS[stage]?.dot || "bg-slate-400"
                                  }`}
                                />
                                {stage}
                              </span>
                            ))}
                          </div>

                          {(() => {
                            const dates = Object.values(d.stage_schedule || {});
                            if (!dates.length) return null;
                            const start = dates
                              .map((w) => w.start_dt)
                              .filter(Boolean)
                              .sort()[0];
                            const end = dates
                              .map((w) => w.end_dt)
                              .filter(Boolean)
                              .sort()
                              .slice(-1)[0];
                            if (!start && !end) return null;
                            return (
                              <span className="text-[11px] text-muted-foreground">
                                {start ? format(parseISO(start), "dd MMM yyyy") : "—"}
                                {" – "}
                                {end ? format(parseISO(end), "dd MMM yyyy") : "—"}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditDeliverable(d)}
                          aria-label={`Edit ${d.name}`}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>

                        <button
                          type="button"
                          data-testid={`${PROJECTS.deliverableRemovePrefix}-${d.id}`}
                          onClick={() => removeDeliverable(d.id)}
                          aria-label={`Remove ${d.name}`}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-slate-50 px-6 py-3.5">
          <button
            type="button"
            data-testid={PROJECTS.modalCancel}
            onClick={handleClose}
            className="h-[34px] rounded-md border border-border bg-white px-3.5 text-[13px] font-semibold text-foreground hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            type="button"
            data-testid={PROJECTS.modalSubmit}
            onClick={handleSubmit}
            aria-disabled={!canCreate}
            disabled={submitting}
            className={`h-[34px] rounded-md px-4 text-[13px] font-semibold transition-colors ${
              canCreate
                ? "bg-[#2b2bb5] text-white hover:bg-[#1a1a8a]"
                : "cursor-not-allowed bg-slate-200 text-slate-400"
            }`}
          >
            {createLabel}
          </button>
        </div>
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
