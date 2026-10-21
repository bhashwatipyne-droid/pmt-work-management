import { makeMatcher } from "@/lib/search";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getClients, getProjects, deleteClient } from "@/services/api";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { AddClientModal } from "@/components/clients/AddClientModal";
import { CLIENTS } from "@/constants/testIds";
import { ClientsListSkeleton } from "@/components/skeletons/Skeletons";
import { ClientModal } from "@/components/clients/ClientModal";
import { primaryButton } from "@/components/clients/clientFormStyles";

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

  // "Add client" from the ⌘K palette lands here with this flag set.
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (location.state?.openAdd) {
      setModal({ open: true, mode: "add", initial: null });
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.key]);

  // Until the first response arrives the table shows a skeleton instead of
  // "No clients yet". Refreshes after an edit keep the current rows.
  const [loadingClients, setLoadingClients] = useState(true);

  const fetchAll = async () => {
    try {
      const [c, p] = await Promise.all([
        getClients(),
        // Only client_id is used from projects here, so skip the nested deliverables.
        getProjects(currentUserId, { include_deliverables: false }),
      ]);

      setClients(c);
      setProjects(p);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load clients");
    } finally {
      setLoadingClients(false);
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
    const match = makeMatcher(search);

    return clients.filter((c) => {
      const contactNames = Array.isArray(c.contact_persons)
        ? c.contact_persons.map((contact) => contact.name || "")
        : [];

      return match(c.name, contactNames, c.contact_person);
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
      className="flex-1 overflow-auto bg-[#f7f9fc] px-3 py-4 md:px-6 md:py-6 lg:px-8"
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
            {loadingClients ? (
              <tr>
                <td colSpan={5} className="p-0">
                  <ClientsListSkeleton />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
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

      <AddClientModal
        open={modal.open && modal.mode === "add"}
        onClose={() =>
          setModal((current) => ({
            ...current,
            open: false,
          }))
        }
        onSaved={fetchAll}
        clients={clients}
        projects={projects}
        onOpenExisting={(client) => setSearch(client.name)}
      />

      <ClientModal
        open={modal.open && modal.mode === "edit"}
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