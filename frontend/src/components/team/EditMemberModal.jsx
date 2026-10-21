import { ROLE_LABELS } from "@/lib/permissions";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import { useUser } from "@/context/UserContext";
import { updateUser } from "@/services/api";
import { inputBase, labelBase } from "./teamStyles";

export const EditMemberModal = ({
  member,
  onClose,
  onSaved,
  options,
}) => {
  const { currentUserId } = useUser();

  const [name, setName] = useState(member?.name || "");
  const [username, setUsername] = useState(
    member?.username || ""
  );
  const [email, setEmail] = useState(
    member?.email || ""
  );
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(
    member?.role || "member"
  );
  const [department, setDepartment] = useState(
    member?.department || ""
  );
  const [active, setActive] = useState(
    member?.active !== false
  );
  const [submitting, setSubmitting] = useState(false);

  // EditMemberModal stays mounted in the tree at all times (the parent
  // always renders it, just with member=null when no one is being
  // edited), so the useState initializers above only run once, on that
  // very first mount. Without this, selecting a different member never
  // repopulates the fields - they'd stay blank. Re-sync every time the
  // member being edited changes.
  useEffect(() => {
    if (!member) return;
    setName(member.name || "");
    setUsername(member.username || "");
    setEmail(member.email || "");
    setPassword("");
    setRole(member.role || "member");
    setDepartment(member.department || "");
    setActive(member.active !== false);
  }, [member]);

  if (!member) return null;

  const handleSubmit = async () => {
    if (!name.trim()) {
      return toast.error("Name required");
    }

    if (!username.trim()) {
      return toast.error("Username required");
    }

    if (!email.trim()) {
      return toast.error("Email required");
    }

    if (password && password.length < 8) {
      return toast.error(
        "Password must be at least 8 characters"
      );
    }

    if (!role) {
      return toast.error("Role required");
    }

    if (!department) {
      return toast.error("Department required");
    }

    setSubmitting(true);

    try {
      const payload = {
        name: name.trim(),
        username: username.trim(),
        email: email.trim(),
        role,
        department,
        active,
      };

      if (password) {
        payload.password = password;
      }

      const updated = await updateUser(
        currentUserId,
        member.id,
        payload
      );

      onSaved?.(updated);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          "Failed to update team member"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Edit Team Member
            </h2>

            <p className="mt-1 text-xs text-slate-500">
              Update account and access details.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Name *
            </label>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputBase}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Username *
            </label>

            <input
              value={username}
              onChange={(e) =>
                setUsername(e.target.value)
              }
              className={inputBase}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Email *
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              className={inputBase}
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Password
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              className={inputBase}
              placeholder="Leave blank to keep current password"
              autoComplete="new-password"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Role
              </label>

              <select
                value={role}
                onChange={(e) =>
                  setRole(e.target.value)
                }
                className={inputBase}
              >
                {(options.roles || [
                  "admin",
                  "manager",
                  "member",
                ]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] || r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Department
              </label>

              <select
                value={department}
                onChange={(e) =>
                  setDepartment(e.target.value)
                }
                className={inputBase}
              >
                {(options.departments || []).map(
                  (d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Status
            </label>

            <select
              value={active ? "active" : "inactive"}
              onChange={(e) =>
                setActive(e.target.value === "active")
              }
              className={inputBase}
            >
              <option value="active">
                Active
              </option>

              <option value="inactive">
                Inactive
              </option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting
              ? "Saving..."
              : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};
