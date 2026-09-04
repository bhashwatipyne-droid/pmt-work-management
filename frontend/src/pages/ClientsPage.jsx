import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  X,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
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
} from "@/services/api";
import { CLIENTS } from "@/constants/testIds";

const inputBase =
  "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";


/* -------------------------------------------------------------------------- */
/* Contact Modal                                                              */
/* -------------------------------------------------------------------------- */

const ContactModal = ({
  open,
  mode,
  initial,
  clientId,
  userId,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setDesignation(initial?.designation || "");
      setEmail(initial?.email || "");
      setPhone(initial?.phone || "");
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!name.trim()) {
      return toast.error("Contact name required");
    }

    setSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        designation: designation.trim(),
        email: email.trim(),
        phone: phone.trim(),
      };

      let result;

      if (mode === "edit") {
        result = await updateContact(
          userId,
          clientId,
          initial.id,
          payload
        );
      } else {
        result = await createContact(
          userId,
          clientId,
          payload
        );
      }

      toast.success(
        mode === "edit"
          ? "Contact updated"
          : "Contact added"
      );

      onSaved?.(result);
      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          "Failed to save contact"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {mode === "edit"
              ? "Edit Contact"
              : "Add Contact"}
          </h2>

          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Name *
            </label>

            <input
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              className={inputBase}
              placeholder="e.g. Priya Desai"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Designation
            </label>

            <input
              value={designation}
              onChange={(e) =>
                setDesignation(e.target.value)
              }
              className={inputBase}
              placeholder="e.g. Marketing Head (optional)"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Email
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              className={inputBase}
              placeholder="e.g. priya@example.com (optional)"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Phone
            </label>

            <input
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value)
              }
              className={inputBase}
              placeholder="e.g. +91 98765 43210 (optional)"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting
              ? "Saving..."
              : mode === "edit"
                ? "Save"
                : "Add Contact"}
          </button>
        </div>
      </div>
    </div>
  );
};


/* -------------------------------------------------------------------------- */
/* Client Modal                                                               */
/* -------------------------------------------------------------------------- */

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
  const [submitting, setSubmitting] = useState(false);

  const [contactModal, setContactModal] = useState({
    open: false,
    mode: "add",
    initial: null,
  });

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setStatus(initial?.status || "Active");

      const existingContacts =
        initial?.contact_persons?.length
          ? initial.contact_persons
          : initial?.contact_person
            ? [
                {
                  id: `legacy-${initial.id}`,
                  name: initial.contact_person,
                  email: "",
                  phone: "",
                  designation: "",
                  legacy: true,
                },
              ]
            : [];

      setContacts(existingContacts);
    }
  }, [open, initial]);

  if (!open) return null;

  const isEdit = mode === "edit";

  const handleSubmit = async () => {
    if (!name.trim()) {
      return toast.error("Client name required");
    }

    setSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        ...(isEdit ? { status } : {}),
      };

      const result = isEdit
        ? await updateClient(
            currentUserId,
            initial.id,
            payload
          )
        : await createClient(
            currentUserId,
            payload
          );

      toast.success(
        isEdit
          ? `Updated ${result.name}`
          : `Added ${result.name}`
      );

      onSaved?.(result);
      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const toggleArchive = async () => {
    if (!isEdit) return;

    const next =
      status === "Inactive"
        ? "Active"
        : "Inactive";

    setSubmitting(true);

    try {
      const updated = await updateClient(
        currentUserId,
        initial.id,
        { status: next }
      );

      setStatus(next);

      toast.success(
        next === "Inactive"
          ? "Client archived"
          : "Client restored"
      );

      onSaved?.(updated);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openAddContact = () => {
    setContactModal({
      open: true,
      mode: "add",
      initial: null,
    });
  };

  const openEditContact = (contact) => {
    if (contact.legacy) {
      return toast.error(
        "This legacy contact will be handled during migration."
      );
    }

    setContactModal({
      open: true,
      mode: "edit",
      initial: contact,
    });
  };

  const handleContactSaved = (result) => {
    if (!result?.id) return;

    setContacts((current) => {
      const exists = current.some(
        (contact) => contact.id === result.id
      );

      if (exists) {
        return current.map((contact) =>
          contact.id === result.id
            ? result
            : contact
        );
      }

      return [...current, result];
    });
  };

  const handleDeleteContact = async (contact) => {
    if (contact.legacy) {
      return toast.error(
        "This legacy contact will be handled during migration."
      );
    }

    const confirmed = window.confirm(
      `Delete ${contact.name}?`
    );

    if (!confirmed) return;

    try {
      await deleteContact(
        currentUserId,
        initial.id,
        contact.id
      );

      setContacts((current) =>
        current.filter(
          (item) => item.id !== contact.id
        )
      );

      toast.success("Contact deleted");
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          "Failed to delete contact"
      );
    }
  };

  return (
    <>
      {/* Client Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6"
        onClick={onClose}
      >
        <div
          className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">
              {isEdit
                ? "Edit Client"
                : "Add Client"}
            </h2>

            <button
              onClick={onClose}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-5">
            {/* Client Name */}
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Client Name *
              </label>

              <input
                data-testid={
                  isEdit
                    ? "clients-edit-modal-name"
                    : CLIENTS.addModalName
                }
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                className={inputBase}
                placeholder="e.g. AMFI"
              />
            </div>

            {/* Contacts - Edit Client only */}
            {isEdit && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-900">
                    Contacts
                    {contacts.length > 0 && (
                      <span className="ml-1 text-slate-400">
                        ({contacts.length})
                      </span>
                    )}
                  </label>

                  <button
                    type="button"
                    onClick={openAddContact}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Contact
                  </button>
                </div>

                {contacts.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-8 text-center">
                    <p className="text-sm text-slate-500">
                      No contacts added yet.
                    </p>

                    <button
                      type="button"
                      onClick={openAddContact}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <Plus className="h-4 w-4" />
                      Add Contact
                    </button>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    {contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-900">
                            {contact.name}
                          </div>

                          {(contact.designation ||
                            contact.email ||
                            contact.phone) && (
                            <div className="mt-0.5 text-xs text-slate-500">
                              {contact.designation && (
                                <span>
                                  {contact.designation}
                                </span>
                              )}

                              {contact.email && (
                                <span>
                                  {contact.designation
                                    ? " · "
                                    : ""}
                                  {contact.email}
                                </span>
                              )}

                              {contact.phone && (
                                <span>
                                  {" · "}
                                  {contact.phone}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="ml-4 flex shrink-0 items-center gap-1">
                          {!contact.legacy && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  openEditContact(
                                    contact
                                  )
                                }
                                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="Edit contact"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteContact(
                                    contact
                                  )
                                }
                                className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                title="Delete contact"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Status - Edit Client only */}
            {isEdit && (
              <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </label>

                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                      status === "Inactive"
                        ? "bg-slate-100 text-slate-500"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {status}
                  </span>

                  <button
                    data-testid="clients-edit-modal-archive"
                    type="button"
                    onClick={toggleArchive}
                    disabled={submitting}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {status === "Inactive" ? (
                      <>
                        <ArchiveRestore className="h-3.5 w-3.5" />
                        Restore
                      </>
                    ) : (
                      <>
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-6 flex justify-end gap-2">
            <button
              data-testid={
                isEdit
                  ? "clients-edit-modal-cancel"
                  : CLIENTS.addModalCancel
              }
              onClick={onClose}
              className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>

            <button
              data-testid={
                isEdit
                  ? "clients-edit-modal-submit"
                  : CLIENTS.addModalSubmit
              }
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting
                ? "Saving..."
                : isEdit
                  ? "Save Changes"
                  : "Add Client"}
            </button>
          </div>
        </div>
      </div>

      {/* Add / Edit Contact Modal */}
      {isEdit && contactModal.open && (
        <ContactModal
          open
          mode={contactModal.mode}
          initial={contactModal.initial}
          clientId={initial.id}
          userId={currentUserId}
          onClose={() =>
            setContactModal((current) => ({
              ...current,
              open: false,
            }))
          }
          onSaved={handleContactSaved}
        />
      )}
    </>
  );
};


/* -------------------------------------------------------------------------- */
/* Clients Page                                                               */
/* -------------------------------------------------------------------------- */

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

  const fetchAll = async () => {
    const [c, p] = await Promise.all([
      getClients(),
      getProjects(currentUserId),
    ]);

    setClients(c);
    setProjects(p);
  };

  useEffect(() => {
    if (currentUser?.role === "admin") {
      fetchAll();
    }
  }, [currentUser?.role]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return clients.filter((client) => {
      if (!q) return true;

      const contactNames = (
        client.contact_persons || []
      )
        .map((contact) => contact.name || "")
        .join(" ");

      return (
        client.name
          .toLowerCase()
          .includes(q) ||
        contactNames
          .toLowerCase()
          .includes(q) ||
        (client.contact_person || "")
          .toLowerCase()
          .includes(q)
      );
    });
  }, [clients, search]);

  const projectCountFor = (clientId) =>
    projects.filter(
      (project) => project.client_id === clientId
    ).length;

  if (userLoading || !currentUser) {
    return null;
  }

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
      className="flex-1 overflow-auto px-8 py-6"
    >
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Clients
        </h1>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              data-testid={CLIENTS.searchInput}
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search clients..."
              className="w-56 rounded-md border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm"
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
            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Add Client
          </button>
        </div>
      </div>

      {/* Client Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
              filtered.map((client) => {
                const pocCount =
                  client.contact_persons?.length ||
                  (client.contact_person ? 1 : 0);

                return (
                  <tr
                    key={client.id}
                    data-testid={`${CLIENTS.rowPrefix}-${client.id}`}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {client.name}
                    </td>

                    <td className="px-4 py-3 text-slate-600">
                      {pocCount}
                    </td>

                    <td className="px-4 py-3 font-medium text-slate-700">
                      {projectCountFor(client.id)}
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          client.status === "Inactive"
                            ? "bg-slate-100 text-slate-500"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {client.status || "Active"}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <button
                        data-testid={`clients-edit-btn-${client.id}`}
                        onClick={() =>
                          setModal({
                            open: true,
                            mode: "edit",
                            initial: client,
                          })
                        }
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        title="Edit client"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Client Modal */}
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
    </div>
  );
}