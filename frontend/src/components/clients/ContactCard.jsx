import { Mail, Pencil, Phone, Trash2 } from "lucide-react";
import { avatarColorClasses } from "@/lib/avatarColors";
import { cleanPhoneInput, getInitials, isValidPhone } from "@/lib/contacts";
import { inputBase } from "./clientFormStyles";

export const ContactCard = ({
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
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${avatarColorClasses(contact.id || contact.name)}`}
            >
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
              type="tel"
              inputMode="tel"
              maxLength={20}
              value={contact.phone || ""}
              onChange={(e) => onChange("phone", cleanPhoneInput(e.target.value))}
              className={`${inputBase} ${
                isValidPhone(contact.phone) ? "" : "border-red-400"
              }`}
              placeholder="e.g. +91 98765 43210"
            />
            {!isValidPhone(contact.phone) && (
              <p className="mt-1 text-[11px] text-red-600">
                Enter a valid phone number (7–15 digits).
              </p>
            )}
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
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarColorClasses(contact.id || contact.name)}`}
        >
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
