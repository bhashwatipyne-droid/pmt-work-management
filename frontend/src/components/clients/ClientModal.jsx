import { CLIENTS } from "@/constants/testIds";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { ContactCard } from "./ContactCard";
import { Plus, UserRound, X } from "lucide-react";
import { createClient, createContact, deleteContact, updateClient, updateContact } from "@/services/api";
import { emptyContact, inputBase, primaryButton, secondaryButton } from "./clientFormStyles";
import { isValidPhone } from "@/lib/contacts";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";

export const ClientModal = ({
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

      if (!isValidPhone(contact.phone)) {
        toast.error(
          `Enter a valid phone number for ${contact.name.trim()} (7–15 digits, numbers only)`
        );
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
        className="flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
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
                // Just a hint - the one "Add Contact" button is in the header
                // above. This used to be a second, identical button.
                <div className="flex min-h-[220px] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 text-center">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200">
                    <UserRound className="h-5 w-5 text-slate-400" />
                  </div>

                  <div className="text-sm font-semibold text-slate-700">
                    No contacts yet
                  </div>

                  <div className="mt-1 text-xs text-slate-400">
                    Use “Add Contact” to add people from this client's team.
                  </div>
                </div>
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
