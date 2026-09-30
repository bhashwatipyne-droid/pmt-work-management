import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertCircle, Check, Plus, Search, Trash2, X } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { createClient, createContact, updateClient } from "@/services/api";
import { CLIENTS } from "@/constants/testIds";
import { emailDomain, findSimilarClients } from "@/lib/lookalikes";
import {
  PUBLIC_EMAIL_DOMAINS,
  cleanPhoneInput,
  getInitials,
  isValidPhone,
} from "@/lib/contacts";

const inputBase =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-white px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const smallButton =
  "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-foreground hover:bg-slate-50";

const emptyContact = () => ({
  key: `c-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: "",
  email: "",
  designation: "",
  phone: "",
});

const clientMeta = (client, projectCounts) => {
  const pocs = Array.isArray(client.contact_persons)
    ? client.contact_persons.length
    : client.contact_person
      ? 1
      : 0;
  const projects = projectCounts?.get(client.id) || 0;
  return `${pocs} ${pocs === 1 ? "POC" : "POCs"} · ${projects} ${projects === 1 ? "project" : "projects"}`;
};

// Add client, checked against the existing clients while the name is typed so
// the same company isn't added twice under a different spelling. A match can
// be opened, reactivated, or used instead ("Add contacts here" adds the new
// contacts to it); a merely similar name has to be confirmed as a different
// client before it can be created.
//
// `onOpenExisting(client)` is what "Open" does (the Clients page shows it;
// the New project modal picks it, so `openLabel` reads "Use this client").
export function AddClientModal({
  open,
  onClose,
  onSaved,
  clients = [],
  projects = [],
  initialName = "",
  onOpenExisting,
  openLabel = "Open",
}) {
  const { currentUserId } = useUser();
  const [name, setName] = useState("");
  const [status, setStatus] = useState("Active");
  const [contacts, setContacts] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [targetId, setTargetId] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName || "");
    setStatus("Active");
    setContacts([]);
    setConfirmed(false);
    setTargetId(null);
    setSubmitting(false);
  }, [open, initialName]);

  const projectCounts = useMemo(() => {
    const counts = new Map();
    projects.forEach((p) => counts.set(p.client_id, (counts.get(p.client_id) || 0) + 1));
    return counts;
  }, [projects]);

  // Which client each (company) email domain already belongs to.
  const domainOwners = useMemo(() => {
    const owners = new Map();
    clients.forEach((client) => {
      (client.contact_persons || []).forEach((contact) => {
        const domain = emailDomain(contact.email);
        if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain) && !owners.has(domain)) {
          owners.set(domain, client);
        }
      });
    });
    return owners;
  }, [clients]);

  if (!open) return null;

  const target = targetId ? clients.find((c) => c.id === targetId) : null;
  const trimmed = name.trim();
  const matches = target ? [] : findSimilarClients(name, clients);
  const exact = matches.find((m) => m.exact);
  const state = target
    ? "target"
    : !trimmed
      ? "empty"
      : trimmed.length < 2
        ? "short"
        : exact
          ? "exact"
          : matches.length
            ? "similar"
            : "clear";

  const namedContacts = contacts.filter((c) => c.name.trim());
  const canCreate = target
    ? namedContacts.length > 0
    : state === "clear" || (state === "similar" && confirmed);

  const domainHits = [];
  contacts.forEach((c) => {
    const owner = domainOwners.get(emailDomain(c.email));
    if (owner && owner.id !== target?.id && !domainHits.includes(owner.name)) {
      domainHits.push(owner.name);
    }
  });

  const checkedText = `Checked against ${clients.length} clients, including inactive ones`;

  const updateContact = (key, field, value) =>
    setContacts((prev) => prev.map((c) => (c.key === key ? { ...c, [field]: value } : c)));

  const addToExisting = (client) => {
    setTargetId(client.id);
    setConfirmed(false);
    if (!contacts.length) setContacts([emptyContact()]);
  };

  const reactivate = async (client) => {
    try {
      const updated = await updateClient(currentUserId, client.id, { status: "Active" });
      toast.success(`${client.name} reactivated`);
      onSaved?.(updated || { ...client, status: "Active" });
      onOpenExisting?.(updated || { ...client, status: "Active" });
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not reactivate client");
    }
  };

  const handleCreate = async () => {
    if (!canCreate || submitting) return;

    for (const contact of namedContacts) {
      if (!isValidPhone(contact.phone)) {
        toast.error(`Enter a valid phone number for ${contact.name.trim()} (7–15 digits, numbers only)`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const client = target
        ? target
        : await createClient(currentUserId, { name: trimmed, status, contact_persons: [] });

      for (const contact of namedContacts) {
        await createContact(currentUserId, client.id, {
          name: contact.name.trim(),
          designation: contact.designation.trim(),
          email: contact.email.trim(),
          phone: contact.phone.trim(),
        });
      }

      toast.success(
        target
          ? `${namedContacts.length} ${namedContacts.length === 1 ? "contact" : "contacts"} added to ${target.name}`
          : `${client.name} created`
      );
      onSaved?.(client);
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to save client");
    } finally {
      setSubmitting(false);
    }
  };

  const nameRing =
    state === "exact"
      ? "border-red-500 ring-[3px] ring-red-50"
      : state === "similar"
        ? "border-amber-500 ring-[3px] ring-amber-100"
        : state === "clear"
          ? "border-emerald-500 ring-[3px] ring-emerald-50"
          : "";

  const createLabel = submitting
    ? "Saving..."
    : target
      ? "Add contacts"
      : state === "exact"
        ? "Client already exists"
        : state === "similar" && !confirmed
          ? "Confirm it’s a new client"
          : "Create client";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={target ? `Add contacts to ${target.name}` : "Add client"}
        data-testid={CLIENTS.addModal}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose?.();
          if (e.key === "Enter" && e.target.tagName === "INPUT") {
            e.preventDefault();
            handleCreate();
          }
        }}
        className="flex max-h-[calc(100vh-48px)] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border px-6 pb-4 pt-5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {target ? `Add contacts to ${target.name}` : "Add client"}
            </h2>
            <span className="text-[13px] text-muted-foreground">
              {target
                ? "New contacts are added to the existing client. No duplicate is created."
                : "We check the name against existing clients as you type."}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5 [&>*]:shrink-0">
          {!target && (
            <>
              <div className="grid grid-cols-[minmax(0,1fr)_160px] gap-3">
                <label className="flex flex-col gap-1.5 text-[13px] font-medium text-slate-700">
                  Client name
                  <input
                    autoFocus
                    data-testid={CLIENTS.addModalName}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setConfirmed(false);
                    }}
                    placeholder="Start typing, e.g. Aditya Birla"
                    className={`${inputBase} ${nameRing}`}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-[13px] font-medium text-slate-700">
                  Status
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className={inputBase}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </label>
              </div>

              {(state === "empty" || state === "short") && (
                <div className="-mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <Search className="h-3 w-3" />
                  {checkedText}
                </div>
              )}
              {state === "clear" && (
                <div className="-mt-2 flex items-center gap-2 text-[13px] text-emerald-800">
                  <Check className="h-3.5 w-3.5" />
                  No existing client with this name. {checkedText}.
                </div>
              )}

              {matches.length > 0 && (
                <div className="-mt-2 flex flex-col overflow-hidden rounded-xl border border-border">
                  {exact ? (
                    <div className="flex items-start gap-2.5 bg-red-50 px-3.5 py-3 text-[13px] leading-[18px]">
                      <AlertCircle className="mt-px h-4 w-4 shrink-0 text-red-500" />
                      <span className="text-foreground">
                        <strong className="font-semibold">This client already exists.</strong>{" "}
                        Open it, or add your contacts to it instead of creating a duplicate.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2.5 bg-amber-100 px-3.5 py-3 text-[13px] leading-[18px]">
                      <AlertCircle className="mt-px h-4 w-4 shrink-0 text-amber-800" />
                      <span className="text-foreground">
                        <strong className="font-semibold">Is it one of these?</strong> These clients
                        have a similar name.
                      </span>
                    </div>
                  )}

                  {matches.map((m) => {
                    const inactive = m.client.status === "Inactive";
                    return (
                      <div
                        key={m.client.id}
                        className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-3.5 py-3"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0f0fd] text-xs font-semibold text-[#1a1a8a]">
                          {getInitials(m.client.name)}
                        </span>
                        <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{m.client.name}</span>
                            <span
                              className={`rounded px-1.5 py-px text-[11px] font-medium ${
                                m.exact ? "bg-red-50 text-red-700" : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {m.exact ? "Same client" : "Possible match"}
                            </span>
                            {inactive && (
                              <span className="rounded bg-slate-100 px-1.5 py-px text-[11px] font-medium text-slate-600">
                                Inactive
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {m.why} · {clientMeta(m.client, projectCounts)}
                          </span>
                        </span>
                        <span className="flex gap-1.5">
                          {onOpenExisting && (
                            <button
                              type="button"
                              className={smallButton}
                              onClick={() => {
                                onOpenExisting(m.client);
                                onClose?.();
                              }}
                            >
                              {openLabel}
                            </button>
                          )}
                          {inactive && (
                            <button type="button" className={smallButton} onClick={() => reactivate(m.client)}>
                              Reactivate
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => addToExisting(m.client)}
                            className="inline-flex h-7 items-center whitespace-nowrap rounded-md bg-[#2b2bb5] px-2.5 text-xs font-semibold text-white hover:bg-[#1a1a8a]"
                          >
                            Add contacts here
                          </button>
                        </span>
                      </div>
                    );
                  })}

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
                      None of these. “{trimmed}” is a different client.
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {target && (
            <div className="flex items-center gap-3 rounded-xl border border-[#dcdcf8] bg-[#f0f0fd] px-3.5 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-semibold text-[#1a1a8a]">
                {getInitials(target.name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">{target.name}</span>
                <span className="text-xs text-muted-foreground">
                  Existing client · {clientMeta(target, projectCounts)}
                </span>
              </span>
              <button type="button" className={smallButton} onClick={() => setTargetId(null)}>
                It’s a different client
              </button>
            </div>
          )}

          {/* Points of contact */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">Points of contact</span>
                <span className="text-xs text-muted-foreground">
                  {target ? "Add at least one." : "Optional. You can add them later."}
                </span>
              </span>
              <button
                type="button"
                className={smallButton}
                onClick={() => setContacts((prev) => [...prev, emptyContact()])}
              >
                <Plus className="h-3 w-3" />
                Add contact
              </button>
            </div>

            {contacts.length === 0 ? (
              <div className="rounded-lg bg-slate-50 p-4 text-center text-[13px] text-muted-foreground">
                No contacts added yet.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {contacts.map((contact) => (
                  <div key={contact.key} className="flex flex-col gap-1">
                    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_32px] items-center gap-2">
                      <input
                        aria-label="Contact name"
                        value={contact.name}
                        onChange={(e) => updateContact(contact.key, "name", e.target.value)}
                        placeholder="Name"
                        className={inputBase}
                      />
                      <input
                        aria-label="Contact email"
                        type="email"
                        value={contact.email}
                        onChange={(e) => updateContact(contact.key, "email", e.target.value)}
                        placeholder="name@company.com"
                        className={inputBase}
                      />
                      <input
                        aria-label="Contact role"
                        value={contact.designation}
                        onChange={(e) => updateContact(contact.key, "designation", e.target.value)}
                        placeholder="Role"
                        className={inputBase}
                      />
                      <input
                        aria-label="Contact phone"
                        type="tel"
                        inputMode="tel"
                        maxLength={20}
                        value={contact.phone}
                        onChange={(e) => updateContact(contact.key, "phone", cleanPhoneInput(e.target.value))}
                        placeholder="Phone"
                        className={`${inputBase} ${isValidPhone(contact.phone) ? "" : "border-red-400"}`}
                      />
                      <button
                        type="button"
                        aria-label="Remove contact"
                        onClick={() => setContacts((prev) => prev.filter((c) => c.key !== contact.key))}
                        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {!isValidPhone(contact.phone) && (
                      <p className="text-right text-[11px] text-red-600">Enter a valid phone number (7–15 digits).</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {domainHits.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-100 px-3 py-2.5 text-xs leading-4 text-foreground">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-800" />
                This email domain already belongs to {domainHits.join(", ")}. Check you are not adding
                the same client twice.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-slate-50 px-6 py-3.5">
          <button
            type="button"
            data-testid={CLIENTS.addModalCancel}
            onClick={onClose}
            disabled={submitting}
            className="h-[34px] rounded-md border border-border bg-white px-3.5 text-[13px] font-semibold text-foreground hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid={CLIENTS.addModalSubmit}
            onClick={handleCreate}
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
    </div>
  );
}
