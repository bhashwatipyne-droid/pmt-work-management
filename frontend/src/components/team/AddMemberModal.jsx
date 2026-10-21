import { ROLE_LABELS } from "@/lib/permissions";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";

import { useUser } from "@/context/UserContext";
import { createUser } from "@/services/api";
import { TEAM } from "@/constants/testIds";
import { inputBase, labelBase } from "./teamStyles";

export const AddMemberModal = ({
  open,
  onClose,
  onCreated,
  options,
}) => {
  const { currentUserId } = useUser();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("member");
  const [department, setDepartment] = useState(
    (options.departments || [])[0] || ""
  );
  const [submitting, setSubmitting] = useState(false);

  // options (departments/roles) are fetched async and can still be empty
  // when this modal first mounts (e.g. the backend is cold-starting). If
  // department was initialized to "" because the list wasn't loaded yet,
  // sync it once real options arrive instead of silently submitting "".
  useEffect(() => {
    if (!department && (options.departments || []).length > 0) {
      setDepartment(options.departments[0]);
    }
  }, [options.departments]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

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

    if (!password) {
      return toast.error("Temporary password required");
    }

    if (!role) {
      return toast.error("Role required");
    }

    if (!department) {
      return toast.error(
        "Department required — the department list may still be loading, please try again in a moment"
      );
    }

    setSubmitting(true);

    try {
      const created = await createUser(currentUserId, {
        name: name.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        role,
        department,
      });

      toast.success(`Added ${created.name}`);

      onCreated?.(created);

      setName("");
      setUsername("");
      setEmail("");
      setPassword("");
      setRole("member");
      setDepartment((options.departments || [])[0] || "");

      onClose?.();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to add"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        data-testid={TEAM.addModal}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Add Team Member
            </h2>

            <p className="mt-0.5 text-sm text-muted-foreground">
              Create a new team account and assign their role.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className={labelBase}>
              Name *
            </label>

            <input
              data-testid={TEAM.addModalName}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputBase}
              placeholder="Full name"
            />
          </div>

          <div>
            <label className={labelBase}>
              Username *
            </label>

            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputBase}
              placeholder="e.g. rahul"
              autoComplete="username"
            />
          </div>

          <div>
            <label className={labelBase}>
              Email *
            </label>

            <input
              data-testid={TEAM.addModalEmail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputBase}
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className={labelBase}>
              Temporary Password *
            </label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputBase}
              placeholder="Temporary password"
              autoComplete="new-password"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelBase}>
                Role
              </label>

              <select
                data-testid={TEAM.addModalRole}
                value={role}
                onChange={(e) => setRole(e.target.value)}
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
              <label className={labelBase}>
                Department
              </label>

              <select
                data-testid={TEAM.addModalDept}
                value={department}
                onChange={(e) =>
                  setDepartment(e.target.value)
                }
                className={inputBase}
              >
                {(options.departments || []).map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-border bg-[#f7f9fc] px-6 py-4">
          <button
            type="button"
            data-testid={TEAM.addModalCancel}
            onClick={onClose}
            className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
          >
            Cancel
          </button>

          <button
            type="button"
            data-testid={TEAM.addModalSubmit}
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-lg bg-[#2b2bb5] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30 disabled:cursor-not-allowed disabled:bg-[#f0f0fd] disabled:text-[#c8d5ee]"
          >
            {submitting ? "Adding..." : "Add Member"}
          </button>
        </div>
      </div>
    </div>
  );
};
