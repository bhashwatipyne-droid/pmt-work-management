import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getUsers, getOptions, createUser, updateUser } from "@/services/api";
import { TEAM } from "@/constants/testIds";

const inputBase = "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const AddMemberModal = ({ open, onClose, onCreated, options }) => {
  const { currentUserId } = useUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("member");
  const [department, setDepartment] = useState((options.departments || [])[0] || "");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!name.trim()) return toast.error("Name required");
    if (!email.trim()) return toast.error("Email required");
    if (!password) return toast.error("Temporary password required");
    setSubmitting(true);
    try {
      const created = await createUser(currentUserId, {
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        department,
      });
      toast.success(`Added ${created.name}`);
      onCreated?.(created);
      setName("");
      setEmail("");
      setPassword("");
      setRole("member");
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to add");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6" onClick={onClose}>
      <div data-testid={TEAM.addModal} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Add Team Member</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Name *</label>
            <input data-testid={TEAM.addModalName} value={name} onChange={(e) => setName(e.target.value)} className={inputBase} placeholder="Full name" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email</label>
            <input data-testid={TEAM.addModalEmail} value={email} onChange={(e) => setEmail(e.target.value)} className={inputBase} placeholder="name@example.com" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Role</label>
              <select data-testid={TEAM.addModalRole} value={role} onChange={(e) => setRole(e.target.value)} className={inputBase}>
                {(options.roles || ["admin", "manager", "member"]).map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Department</label>
              <select data-testid={TEAM.addModalDept} value={department} onChange={(e) => setDepartment(e.target.value)} className={inputBase}>
                {(options.departments || []).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button data-testid={TEAM.addModalCancel} onClick={onClose} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Cancel</button>
          <button data-testid={TEAM.addModalSubmit} onClick={handleSubmit} disabled={submitting} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {submitting ? "Adding..." : "Add Member"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function TeamPage() {
  const { currentUser, currentUserId, loading: userLoading } = useUser();
  const [members, setMembers] = useState([]);
  const [options, setOptions] = useState({ departments: [], roles: [] });
  const [pending, setPending] = useState({}); // { userId: { department, role } }
  const [modalOpen, setModalOpen] = useState(false);

  const fetchAll = async () => {
    const [u, o] = await Promise.all([getUsers(), getOptions()]);
    setMembers(u);
    setOptions(o);
  };

  useEffect(() => { if (currentUser?.role === "admin") fetchAll(); }, [currentUser?.role]);

  const setField = (id, key, value) => setPending((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  const handleSave = async (member) => {
    const patch = pending[member.id] || {};
    if (Object.keys(patch).length === 0) return toast("Nothing to save");
    try {
      const updated = await updateUser(currentUserId, member.id, patch);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? updated : m)));
      setPending((prev) => { const n = { ...prev }; delete n[member.id]; return n; });
      toast.success(`Saved ${updated.name}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    }
  };

  const roster = useMemo(() => members.filter((m) => m.role !== "admin"), [members]);

  if (userLoading || !currentUser) return null;
  if (currentUser.role !== "admin") {
    return <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-600">Team is available to Admins only</div>;
  }

  return (
    <div data-testid={TEAM.page} className="flex-1 overflow-auto px-8 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Team</h1>
        <button data-testid={TEAM.addBtn} onClick={() => setModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          <Plus className="h-4 w-4" /> Add Team Member
        </button>
      </div>

      {/* New Approvals — placeholder (auth deferred) */}
      <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/40 p-5">
        <h2 className="text-base font-bold text-slate-900">New Approvals</h2>
        <p className="mb-3 text-sm text-slate-500">Registration requests waiting for admin approval.</p>
        <div data-testid={TEAM.newApprovalsEmpty} className="rounded-lg border border-slate-200 bg-white py-8 text-center text-sm text-slate-400">
          No new approval requests. (Sign-up flow arrives with authentication.)
        </div>
      </div>

      {/* Previous Approvals (roster) */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <h2 className="text-base font-bold text-slate-900">Previous Approvals</h2>
        <p className="mb-4 text-sm text-slate-500">Approved and inactive team accounts.</p>
        <div className="overflow-x-auto">
          <table data-testid={TEAM.rosterTable} className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email ID</th>
                <th className="py-2 pr-4">Department</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((m) => {
                const p = pending[m.id] || {};
                const dept = p.department ?? (m.department || "");
                const role = p.role ?? m.role;
                const dirty = Object.keys(p).length > 0;
                return (
                  <tr key={m.id} data-testid={`${TEAM.rowPrefix}-${m.id}`} className="border-b border-slate-50 last:border-0">
                    <td className="py-3 pr-4 font-semibold text-slate-900">{m.name}</td>
                    <td className="py-3 pr-4 text-slate-600">{m.email || "—"}</td>
                    <td className="py-3 pr-4">
                      <select data-testid={`${TEAM.deptSelectPrefix}-${m.id}`} value={dept} onChange={(e) => setField(m.id, "department", e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-sm">
                        <option value="">—</option>
                        {(options.departments || []).map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <select data-testid={`${TEAM.roleSelectPrefix}-${m.id}`} value={role} onChange={(e) => setField(m.id, "role", e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-sm capitalize">
                        {(options.roles || ["manager", "member"]).map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <button
                          data-testid={`${TEAM.saveRolePrefix}-${m.id}`}
                          onClick={() => handleSave(m)}
                          disabled={!dirty}
                          className="rounded border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          Save Role
                        </button>
                        <span data-testid={`${TEAM.activeBadgePrefix}-${m.id}`} className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.active === false ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}>
                          {m.active === false ? "Inactive" : "Active"}
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

      <AddMemberModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={fetchAll} options={options} />
    </div>
  );
}