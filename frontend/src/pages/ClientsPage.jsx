import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, Search, X, Pencil, Archive, ArchiveRestore } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getClients, createClient, updateClient, getProjects } from "@/services/api";
import { CLIENTS } from "@/constants/testIds";

const inputBase = "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100";

const ClientModal = ({ open, mode, initial, onClose, onSaved }) => {
  const { currentUserId } = useUser();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState("Active");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initial?.name || "");
      setContact(initial?.contact_person || "");
      setStatus(initial?.status || "Active");
    }
  }, [open, initial]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!name.trim()) return toast.error("Client name required");
    setSubmitting(true);
    try {
      if (mode === "edit") {
        const updated = await updateClient(currentUserId, initial.id, {
          name: name.trim(),
          contact_person: contact.trim(),
          status,
        });
        toast.success(`Updated ${updated.name}`);
        onSaved?.(updated);
      } else {
        const created = await createClient(currentUserId, { name: name.trim(), contact_person: contact.trim() });
        toast.success(`Added ${created.name}`);
        onSaved?.(created);
      }
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally { setSubmitting(false); }
  };

  const toggleArchive = async () => {
    if (mode !== "edit") return;
    const next = status === "Inactive" ? "Active" : "Inactive";
    setSubmitting(true);
    try {
      const updated = await updateClient(currentUserId, initial.id, { status: next });
      setStatus(next);
      toast.success(next === "Inactive" ? "Client archived" : "Client restored");
      onSaved?.(updated);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-6" onClick={onClose}>
      <div data-testid={mode === "edit" ? "clients-edit-modal" : CLIENTS.addModal} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{mode === "edit" ? "Edit Client" : "Add Client"}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Client Name *</label>
            <input data-testid={mode === "edit" ? "clients-edit-modal-name" : CLIENTS.addModalName} value={name} onChange={(e) => setName(e.target.value)} className={inputBase} placeholder="e.g. AMFI" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Contact Person</label>
            <input data-testid={mode === "edit" ? "clients-edit-modal-contact" : CLIENTS.addModalContact} value={contact} onChange={(e) => setContact(e.target.value)} className={inputBase} placeholder="Full name" />
          </div>
          {mode === "edit" && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</label>
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${status === "Inactive" ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}>{status}</span>
                <button
                  data-testid="clients-edit-modal-archive"
                  type="button"
                  onClick={toggleArchive}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {status === "Inactive" ? <><ArchiveRestore className="h-3.5 w-3.5" /> Restore</> : <><Archive className="h-3.5 w-3.5" /> Archive</>}
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button data-testid={mode === "edit" ? "clients-edit-modal-cancel" : CLIENTS.addModalCancel} onClick={onClose} className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Cancel</button>
          <button data-testid={mode === "edit" ? "clients-edit-modal-submit" : CLIENTS.addModalSubmit} onClick={handleSubmit} disabled={submitting} className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
            {submitting ? "Saving..." : (mode === "edit" ? "Save Changes" : "Add Client")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default function ClientsPage() {
  const { currentUser, currentUserId, loading: userLoading } = useUser();
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState({ open: false, mode: "add", initial: null });

  const fetchAll = async () => {
    const [c, p] = await Promise.all([getClients(), getProjects(currentUserId)]);
    setClients(c);
    setProjects(p);
  };

  useEffect(() => { if (currentUser?.role === "admin") fetchAll(); }, [currentUser?.role]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.contact_person || "").toLowerCase().includes(q));
  }, [clients, search]);

  const projectCountFor = (clientId) => projects.filter((p) => p.client_id === clientId).length;

  if (userLoading || !currentUser) return null;
  if (currentUser.role !== "admin") {
    return <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-600">Clients is available to Admins only</div>;
  }

  return (
    <div data-testid={CLIENTS.page} className="flex-1 overflow-auto px-8 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Clients</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input data-testid={CLIENTS.searchInput} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search clients..." className="w-56 rounded-md border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm" />
          </div>
          <button data-testid={CLIENTS.addBtn} onClick={() => setModal({ open: true, mode: "add", initial: null })} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <Plus className="h-4 w-4" /> Add Client
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              <th className="px-4 py-3">Client Name</th>
              <th className="px-4 py-3">Contact Person</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Projects</th>
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">No clients yet</td></tr>
            ) : filtered.map((c) => (
              <tr key={c.id} data-testid={`${CLIENTS.rowPrefix}-${c.id}`} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3 font-semibold text-slate-900">{c.name}</td>
                <td className="px-4 py-3 text-slate-600">{c.contact_person || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.status === "Inactive" ? "bg-slate-100 text-slate-500" : "bg-emerald-100 text-emerald-700"}`}>
                    {c.status || "Active"}
                  </span>
                </td>
                <td className="px-4 py-3 font-medium text-slate-700">{projectCountFor(c.id)}</td>
                <td className="px-4 py-3">
                  <button
                    data-testid={`clients-edit-btn-${c.id}`}
                    onClick={() => setModal({ open: true, mode: "edit", initial: c })}
                    className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Edit client"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ClientModal
        open={modal.open}
        mode={modal.mode}
        initial={modal.initial}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        onSaved={fetchAll}
      />
    </div>
  );
}
