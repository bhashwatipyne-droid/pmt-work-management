import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  X,
  Pencil,
  Trash2,
  Mail,
  Phone,
  UserRound,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import {
  getClients,
  createClient,
  updateClient,
  getProjects,
  createContact,
  updateContact,
  deleteContact,
  deleteClient,
} from "@/services/api";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { CLIENTS } from "@/constants/testIds";

const inputBase =
  "w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20 disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20 disabled:cursor-not-allowed disabled:opacity-60";

const primaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2b2bb5] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30 disabled:cursor-not-allowed disabled:bg-[#f0f0fd] disabled:text-[#c8d5ee]";

const getInitials = (name = "") => {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const emptyContact = () => ({
  id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: "",
  designation: "",
  email: "",
  phone: "",
  isDraft: true,
});

const ContactCard = ({
  contact,
  editing,
  onEdit,
  onDelete,
  onChange,
  onCancelEdit,
}) => {
  if (editing) {
    return (
      <div className="rounded-xl border border-[#dcdcf8] bg-[#f0f0fd]/50 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f0f0fd] text-xs font-semibold text-[#2b2bb5]">
              {getInitials(contact.name)}
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {contact.isDraft ? "New Contact" : "Edit Contact"}
              </div>
              <div className="text-xs text-slate-500">
                Contact details
              </div>
            </div>
          </div>

          {contact.isDraft && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-red-500"
              title="Remove contact"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Name *
            </label>
            <input
              autoFocus={contact.isDraft}
              value={contact.name}
              onChange={(e) => onChange("name", e.target.value)}
              className={inputBase}
              placeholder="e.g. Priya Desai"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Designation
            </label>
            <input
              value={contact.designation || ""}
              onChange={(e) => onChange("designation", e.target.value)}
              className={inputBase}
              placeholder="e.g. Marketing Head"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Email
            </label>
            <input
              type="email"
              value={contact.email || ""}
              onChange={(e) => onChange("email", e.target.value)}
              className={inputBase}
              placeholder="e.g. priya@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Phone
            </label>
            <input
              value={contact.phone || ""}
              onChange={(e) => onChange("phone", e.target.value)}
              className={inputBase}
              placeholder="e.g. +91 98765 43210"
            />
          </div>
        </div>

        {!contact.isDraft && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={onCancelEdit}
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              Done editing
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="group rounded-xl border border-border bg-white p-4 transition-shadow hover:border-slate-300 hover:shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f0f0fd] text-sm font-semibold text-[#2b2bb5]">
          {getInitials(contact.name)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {contact.name || "Unnamed contact"}
              </div>

              {contact.designation && (
                <div className="mt-0.5 text-xs text-slate-500">
                  {contact.designation}
                </div>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Edit contact"
              >
                <Pencil className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={onDelete}
                className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                title="Delete contact"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-2 space-y-1">
            {contact.email && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}

            {contact.phone && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span>{contact.phone}</span>
              </div>
            )}

            {!contact.email && !contact.phone && (
              <div className="text-xs text-slate-400">
                No contact details added
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ClientModal = ({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}) => {
  const { currentUserId } = useUser();

  const [name, setName] = useState("");
  const [status, setStatus] = useState("Active");
  const [contacts, setContacts] = useState([]);
  const [editingContactId, setEditingContactId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteContactTarget, setDeleteContactTarget] = useState(null);
  const [deletingContact, setDeletingContact] = useState(false);

  useEffect(() => {
    if (!open) return;

    setName(initial?.name || "");
    setStatus(initial?.status || "Active");

    const existingContacts = Array.isArray(initial?.contact_persons)
      ? initial.contact_persons
      : [];

    setContacts(existingContacts);
    setEditingContactId(null);
  }, [open, initial]);

  if (!open) return null;

  const addContact = () => {
    const contact = emptyContact();

    setContacts((prev) => [...prev, contact]);
    setEditingContactId(contact.id);
  };

  const updateContactField = (contactId, field, value) => {
    setContacts((prev) =>
      prev.map((contact) =>
        contact.id === contactId
          ? { ...contact, [field]: value }
          : contact
      )
    );
  };

  const removeContact = (contact) => {
    if (!contact?.id) return;

    // Draft contacts have never been saved, so remove locally.
    if (contact.isDraft) {
      setContacts((prev) =>
        prev.filter((item) => item.id !== contact.id)
      );

      if (editingContactId === contact.id) {
        setEditingContactId(null);
      }

      return;
    }

    setDeleteContactTarget(contact);
  };

  const handleContactDelete = async () => {
    if (!deleteContactTarget?.id) return;

    setDeletingContact(true);

    try {
      await deleteContact(
        currentUserId,
        initial.id,
        deleteContactTarget.id
      );

      setContacts((prev) =>
        prev.filter((item) => item.id !== deleteContactTarget.id)
      );

      if (editingContactId === deleteContactTarget.id) {
        setEditingContactId(null);
      }

      toast.success("Contact deleted");
      setDeleteContactTarget(null);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          "Could not delete contact"
      );
    } finally {
      setDeletingContact(false);
    }
  };

  const validateContacts = () => {
    for (const contact of contacts) {
      if (!contact.name?.trim()) {
        toast.error("Every contact needs a name");
        setEditingContactId(contact.id);
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Client name required");
      return;
    }

    if (!validateContacts()) {
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "add") {
        /*
         * Create the client first.
         * Contacts are still only local draft data at this point.
         */
        const created = await createClient(currentUserId, {
          name: name.trim(),
          status,
          contact_persons: [],
        });

        /*
         * Now attach all contacts to the newly created client.
         */
        for (const contact of contacts) {
          await createContact(currentUserId, created.id, {
            name: contact.name.trim(),
            designation: contact.designation?.trim() || "",
            email: contact.email?.trim() || "",
            phone: contact.phone?.trim() || "",
          });
        }

        toast.success(`Added ${created.name}`);
        onSaved?.(created);
      } else {
        /*
         * Update basic client information.
         */
        const updated = await updateClient(
          currentUserId,
          initial.id,
          {
            name: name.trim(),
            status,
          }
        );

        /*
         * Update existing contacts and create new contacts.
         */
        for (const contact of contacts) {
          const payload = {
            name: contact.name.trim(),
            designation: contact.designation?.trim() || "",
            email: contact.email?.trim() || "",
            phone: contact.phone?.trim() || "",
          };

          if (contact.isDraft) {
            await createContact(
              currentUserId,
              initial.id,
              payload
            );
          } else {
            await updateContact(
              currentUserId,
              initial.id,
              contact.id,
              payload
            );
          }
        }

        toast.success(`Updated ${updated.name}`);
        onSaved?.(updated);
      }

      onClose?.();
    } catch (err) {
      console.error(err);
      toast.error(
        err?.response?.data?.detail ||
          "Failed to save client"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === "edit" ? "Edit Client" : "Add Client";
  const subtitle =
    mode === "edit"
      ? "Update the client details and manage their points of contact."
      : "Add the client details and key contacts. You can add multiple contacts now.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        data-testid={
          mode === "edit"
            ? "clients-edit-modal"
            : CLIENTS.addModal
        }
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-border px-7 py-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              {subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main content */}
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[0.9fr_1.35fr]">
          {/* LEFT — CLIENT DETAILS */}
          <div className="border-b border-border p-7 lg:border-b-0 lg:border-r">
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-foreground">
                Client details
              </h3>

              <p className="mt-1 text-xs text-muted-foreground">
                Basic information about this client.
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Client Name *
                </label>

                <input
                  data-testid={
                    mode === "edit"
                      ? "clients-edit-modal-name"
                      : CLIENTS.addModalName
                  }
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputBase}
                  placeholder="e.g. AMFI"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </label>

                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputBase}
                  disabled={submitting}
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* RIGHT — CONTACTS */}
          <div className="min-h-0 p-7">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Contacts / Points of Contact
                </h3>

                <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                  Add key people from the client's team. You can
                  add multiple contacts.
                </p>
              </div>

              <button
                type="button"
                onClick={addContact}
                disabled={submitting}
                className={secondaryButton}
              >
                <Plus className="h-4 w-4" />
                Add Contact
              </button>
            </div>

            <div className="space-y-3">
              {contacts.length === 0 ? (
                <button
                  type="button"
                  onClick={addContact}
                  disabled={submitting}
                  className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 text-center hover:border-slate-400 hover:bg-slate-50"
                >
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
                    <UserRound className="h-5 w-5 text-slate-400" />
                  </div>

                  <div className="text-sm font-semibold text-slate-700">
                    + Add a Contact
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    Add people from this client's team.
                  </div>
                </button>
              ) : (
                <>
                  {contacts.map((contact) => (
                    <ContactCard
                      key={contact.id}
                      contact={contact}
                      editing={
                        editingContactId === contact.id
                      }
                      onEdit={() =>
                        setEditingContactId(contact.id)
                      }
                      onDelete={() =>
                        removeContact(contact)
                      }
                      onChange={(field, value) =>
                        updateContactField(
                          contact.id,
                          field,
                          value
                        )
                      }
                      onCancelEdit={() =>
                        setEditingContactId(null)
                      }
                    />
                  ))}

                  <button
                    type="button"
                    onClick={addContact}
                    disabled={submitting}
                    className="flex min-h-[82px] w-full items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/30 px-5 hover:border-slate-400 hover:bg-slate-50"
                  >
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
                        <Plus className="h-4 w-4" />
                        Add Another Contact
                      </div>

                      <div className="mt-1 text-xs text-slate-400">
                        You can add multiple contacts for this client.
                      </div>
                    </div>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-[#f7f9fc] px-7 py-4">
          <button
            data-testid={
              mode === "edit"
                ? "clients-edit-modal-cancel"
                : CLIENTS.addModalCancel
            }
            type="button"
            onClick={onClose}
            disabled={submitting}
            className={secondaryButton}
          >
            Cancel
          </button>

          <button
            data-testid={
              mode === "edit"
                ? "clients-edit-modal-submit"
                : CLIENTS.addModalSubmit
            }
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className={primaryButton}
          >
            {submitting
              ? "Saving..."
              : mode === "edit"
                ? "Save Changes"
                : "Create Client"}
          </button>
        </div>
      </div>

      <ConfirmDeleteModal
        open={!!deleteContactTarget}
        onClose={() => {
          if (!deletingContact) {
            setDeleteContactTarget(null);
          }
        }}
        onConfirm={handleContactDelete}
        title="Delete this contact?"
        description={`"${deleteContactTarget?.name || "This contact"}" will be permanently deleted.`}
        warning="If this contact is currently assigned to a project, the deletion will be blocked."
        confirmLabel="Delete Contact"
        loading={deletingContact}
      />
    </div>
  );
};

export default function ClientsPage() {
  const {
    currentUser,
    currentUserId,
    loading: userLoading,
  } = useUser();

  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");

  const [modal, setModal] = useState({
    open: false,
    mode: "add",
    initial: null,
  });

  const [deleteClientTarget, setDeleteClientTarget] = useState(null);
  const [deletingClient, setDeletingClient] = useState(false);

  const fetchAll = async () => {
    try {
      const [c, p] = await Promise.all([
        getClients(),
        getProjects(currentUserId),
      ]);

      setClients(c);
      setProjects(p);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load clients");
    }
  };

  const handleClientDelete = async () => {
    if (!deleteClientTarget?.id) return;

    setDeletingClient(true);

    try {
      await deleteClient(
        currentUserId,
        deleteClientTarget.id
      );

      toast.success("Client deleted");
      setDeleteClientTarget(null);
      await fetchAll();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          "Could not delete client"
      );
    } finally {
      setDeletingClient(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === "admin") {
      fetchAll();
    }
  }, [currentUser?.role]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return clients.filter((c) => {
      if (!q) return true;

      const contactNames = Array.isArray(c.contact_persons)
        ? c.contact_persons
            .map((contact) => contact.name || "")
            .join(" ")
        : "";

      return (
        c.name?.toLowerCase().includes(q) ||
        contactNames.toLowerCase().includes(q) ||
        (c.contact_person || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [clients, search]);

  const projectCountFor = (clientId) =>
    projects.filter((p) => p.client_id === clientId).length;

  const pocCountFor = (client) => {
    if (
      Array.isArray(client.contact_persons) &&
      client.contact_persons.length
    ) {
      return client.contact_persons.length;
    }

    return client.contact_person ? 1 : 0;
  };

  if (userLoading || !currentUser) return null;

  if (currentUser.role !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-600">
        Clients is available to Admins only
      </div>
    );
  }

  return (
    <div
      data-testid={CLIENTS.page}
      className="flex-1 overflow-auto bg-[#f7f9fc] px-6 py-6 lg:px-8"
    >
      {/* PAGE HEADER */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Clients
        </h1>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <input
              data-testid={CLIENTS.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-56 rounded-lg border border-input bg-white py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/20"
            />
          </div>

          <button
            data-testid={CLIENTS.addBtn}
            onClick={() =>
              setModal({
                open: true,
                mode: "add",
                initial: null,
              })
            }
            className={primaryButton}
          >
            <Plus className="h-4 w-4" />
            Add Client
          </button>
        </div>
      </div>

      {/* CLIENT TABLE */}
      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-[#f7f9fc] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3">
                Client Name
              </th>

              <th className="px-4 py-3">
                POCs
              </th>

              <th className="px-4 py-3">
                Projects
              </th>

              <th className="px-4 py-3">
                Status
              </th>

              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-10 text-center text-sm text-slate-400"
                >
                  No clients yet
                </td>
              </tr>
            ) : (
              filtered.map((client) => (
                <tr
                  key={client.id}
                  data-testid={`${CLIENTS.rowPrefix}-${client.id}`}
                  className="border-b border-border last:border-0 transition-colors hover:bg-[#fafbff]"
                >
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {client.name}
                  </td>

                  <td className="px-4 py-3 text-slate-600">
                    {pocCountFor(client)}
                  </td>

                  <td className="px-4 py-3 font-medium text-slate-700">
                    {projectCountFor(client.id)}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                        client.status === "Inactive"
                          ? "bg-slate-100 text-slate-500"
                          : "bg-green-50 text-green-700"
                      }`}
                    >
                      {client.status || "Active"}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        data-testid={`clients-edit-btn-${client.id}`}
                        onClick={() =>
                          setModal({
                            open: true,
                            mode: "edit",
                            initial: client,
                          })
                        }
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
                        title="Edit client"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteClientTarget(client)}
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-200"
                        title="Delete client"
                        aria-label="Delete client"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ClientModal
        open={modal.open}
        mode={modal.mode}
        initial={modal.initial}
        onClose={() =>
          setModal((current) => ({
            ...current,
            open: false,
          }))
        }
        onSaved={fetchAll}
      />

      <ConfirmDeleteModal
        open={!!deleteClientTarget}
        onClose={() => {
          if (!deletingClient) {
            setDeleteClientTarget(null);
          }
        }}
        onConfirm={handleClientDelete}
        title="Delete this client?"
        description={`"${deleteClientTarget?.name || "This client"}" will be permanently deleted.`}
        warning="A client with active projects cannot be deleted. Completed-project history will be preserved."
        confirmLabel="Delete Client"
        loading={deletingClient}
      />
    </div>
  );
}