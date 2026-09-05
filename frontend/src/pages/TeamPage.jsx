import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { useUser } from "@/context/UserContext";
import {
  getUsers,
  getOptions,
  createUser,
  updateUser,
} from "@/services/api";
import { TEAM } from "@/constants/testIds";

const inputBase =
  "w-full rounded-lg border border-input bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20";

const smallSelectBase =
  "rounded-md border border-input bg-white px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15";

const labelBase =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const AddMemberModal = ({
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
                    {r}
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

export default function TeamPage() {
  const {
    currentUser,
    currentUserId,
    loading: userLoading,
  } = useUser();

  const [members, setMembers] = useState([]);
  const [options, setOptions] = useState({
    departments: [],
    roles: [],
  });
  const [pending, setPending] = useState({});
  const [modalOpen, setModalOpen] = useState(false);

  const fetchAll = async () => {
    const [u, o] = await Promise.all([
      getUsers(),
      getOptions(),
    ]);

    setMembers(u);
    setOptions(o);
  };

  useEffect(() => {
    if (currentUser?.role === "admin") {
      fetchAll();
    }
  }, [currentUser?.role]);

  const setField = (id, key, value) =>
    setPending((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        [key]: value,
      },
    }));

  const handleSave = async (member) => {
    const patch = pending[member.id] || {};

    if (Object.keys(patch).length === 0) {
      return toast("Nothing to save");
    }

    try {
      const updated = await updateUser(
        currentUserId,
        member.id,
        patch
      );

      setMembers((prev) =>
        prev.map((m) =>
          m.id === member.id ? updated : m
        )
      );

      setPending((prev) => {
        const n = { ...prev };
        delete n[member.id];
        return n;
      });

      toast.success(`Saved ${updated.name}`);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Save failed"
      );
    }
  };

  const roster = useMemo(
    () => members.filter((m) => m.role !== "admin"),
    [members]
  );

  if (userLoading || !currentUser) return null;

  if (currentUser.role !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#f7f9fc] p-8 text-sm text-muted-foreground">
        Team is available to Admins only
      </div>
    );
  }

  return (
    <div
      data-testid={TEAM.page}
      className="flex-1 overflow-auto bg-[#f7f9fc] px-6 py-6 lg:px-8"
    >
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Team
            </h1>

            <span className="text-sm font-medium text-muted-foreground">
              {roster.length}
            </span>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Manage team members, roles and departments.
          </p>
        </div>

        <button
          type="button"
          data-testid={TEAM.addBtn}
          onClick={() => setModalOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2b2bb5] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30"
        >
          <Plus className="h-4 w-4" />
          Add Team Member
        </button>
      </div>

      {/* New Approvals */}
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/50 p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">
            New Approvals
          </h2>

          <p className="mt-1 text-xs text-muted-foreground">
            Registration requests waiting for admin approval.
          </p>
        </div>

        <div
          data-testid={TEAM.newApprovalsEmpty}
          className="rounded-lg border border-border bg-white px-4 py-8 text-center text-sm text-muted-foreground"
        >
          No new approval requests. (Sign-up flow arrives
          with authentication.)
        </div>
      </div>

      {/* Previous Approvals */}
      <div className="rounded-xl border border-border bg-white p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">
            Previous Approvals
          </h2>

          <p className="mt-1 text-xs text-muted-foreground">
            Approved and inactive team accounts.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table
            data-testid={TEAM.rosterTable}
            className="w-full min-w-[720px] text-left text-sm"
          >
            <thead>
              <tr className="border-b border-border bg-[#f7f9fc] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-3">
                  Name
                </th>

                <th className="px-3 py-3">
                  Email ID
                </th>

                <th className="px-3 py-3">
                  Department
                </th>

                <th className="px-3 py-3">
                  Role
                </th>

                <th className="px-3 py-3">
                  Status
                </th>
              </tr>
            </thead>

            <tbody>
              {roster.map((m) => {
                const p = pending[m.id] || {};
                const dept =
                  p.department ?? (m.department || "");
                const role = p.role ?? m.role;
                const dirty = Object.keys(p).length > 0;

                return (
                  <tr
                    key={m.id}
                    data-testid={`${TEAM.rowPrefix}-${m.id}`}
                    className="border-b border-border last:border-0 transition-colors hover:bg-[#fafbff]"
                  >
                    <td className="px-3 py-3.5">
                      <div className="font-medium text-foreground">
                        {m.name}
                      </div>
                    </td>

                    <td className="px-3 py-3.5 text-sm text-muted-foreground">
                      {m.email || "—"}
                    </td>

                    <td className="px-3 py-3.5">
                      <select
                        data-testid={`${TEAM.deptSelectPrefix}-${m.id}`}
                        value={dept}
                        onChange={(e) =>
                          setField(
                            m.id,
                            "department",
                            e.target.value
                          )
                        }
                        className={smallSelectBase}
                      >
                        <option value="">—</option>

                        {(options.departments || []).map(
                          (d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          )
                        )}
                      </select>
                    </td>

                    <td className="px-3 py-3.5">
                      <select
                        data-testid={`${TEAM.roleSelectPrefix}-${m.id}`}
                        value={role}
                        onChange={(e) =>
                          setField(
                            m.id,
                            "role",
                            e.target.value
                          )
                        }
                        className={`${smallSelectBase} capitalize`}
                      >
                        {(
                          options.roles || [
                            "manager",
                            "member",
                          ]
                        ).map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="px-3 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          data-testid={`${TEAM.saveRolePrefix}-${m.id}`}
                          onClick={() => handleSave(m)}
                          disabled={!dirty}
                          className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Save Role
                        </button>

                        <span
                          data-testid={`${TEAM.activeBadgePrefix}-${m.id}`}
                          className={[
                            "rounded-md px-2 py-1",
                            "text-[10px] font-semibold uppercase tracking-wide",
                            m.active === false
                              ? "bg-slate-100 text-slate-500"
                              : "bg-green-50 text-green-700",
                          ].join(" ")}
                        >
                          {m.active === false
                            ? "Inactive"
                            : "Active"}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AddMemberModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={fetchAll}
        options={options}
      />
    </div>
  );
}