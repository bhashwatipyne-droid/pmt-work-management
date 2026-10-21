import { PROJECTS } from "@/constants/testIds";
import { Plus, Search } from "lucide-react";
import { getInitials } from "@/lib/contacts";
import { smallButton } from "@/components/projects/createProjectLogic";

export function CreateProjectClientPicker(ctx) {
  const { activeClientIndex, availablePocs, clientChoiceCount, clientMenuOpen, clientMeta, clientOptions, clientQuery, pickClient, projectCounts, q, selectedClient, setAddClientName, setClientId, setClientIndex, setClientMenuOpen, setClientQuery, setPocId, showAddNewClient } = ctx;
  return (
    <>
    {/* Client */}
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-700">Client</span>
      {selectedClient ? (
        <div className="flex items-center gap-2.5 rounded-[10px] border border-slate-200 py-2 pl-2.5 pr-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#f0f0fd] text-[11px] font-semibold text-[#1a1a8a]">
            {getInitials(selectedClient.name)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="text-sm font-semibold text-foreground">{selectedClient.name}</span>
            <span className="text-xs text-muted-foreground">
              {projectCounts.get(selectedClient.id) || 0} projects · {availablePocs.length} POCs
            </span>
          </span>
          <button
            type="button"
            data-testid={PROJECTS.fieldClient}
            className={smallButton}
            onClick={() => {
              setClientId("");
              setClientMenuOpen(true);
              setPocId("");
            }}
          >
            Change
          </button>
        </div>
      ) : (
        <div className="relative">
          {clientMenuOpen && (
            <div className="fixed inset-0 z-[1]" onMouseDown={() => setClientMenuOpen(false)} />
          )}
          <label className="relative z-[2] flex h-10 items-center gap-2 rounded-[10px] border border-[#2b2bb5] bg-white px-3 text-muted-foreground ring-[3px] ring-[#2b2bb5]/15">
            <Search className="h-3.5 w-3.5" />
            <input
              autoFocus
              role="combobox"
              aria-expanded={clientMenuOpen}
              aria-label="Search client"
              data-testid={PROJECTS.fieldClient}
              value={clientQuery}
              onChange={(e) => {
                setClientQuery(e.target.value);
                setClientMenuOpen(true);
                setClientIndex(0);
              }}
              onFocus={() => setClientMenuOpen(true)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setClientMenuOpen(true);
                  setClientIndex(Math.min(activeClientIndex + 1, clientChoiceCount - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setClientIndex(Math.max(activeClientIndex - 1, 0));
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  if (activeClientIndex < clientOptions.length) {
                    pickClient(clientOptions[activeClientIndex].client);
                  } else if (showAddNewClient) {
                    setAddClientName(clientQuery.trim());
                    setClientMenuOpen(false);
                  }
                } else if (e.key === "Escape" && clientMenuOpen) {
                  e.stopPropagation();
                  setClientMenuOpen(false);
                }
              }}
              placeholder="Search client by name or short name, e.g. ABSL"
              className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none"
            />
          </label>
          {clientMenuOpen && (
            <div
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-[3] flex max-h-80 flex-col gap-px overflow-auto rounded-xl border border-border bg-white p-1.5 shadow-lg"
            >
              <span className="px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                {q ? "Matching clients" : "Most used clients"}
              </span>
              {clientOptions.map(({ client, why }, i) => (
                <button
                  key={client.id}
                  type="button"
                  role="option"
                  aria-selected={i === activeClientIndex}
                  onClick={() => pickClient(client)}
                  className={`flex min-h-10 items-center gap-2.5 rounded-md px-2 py-1 text-left hover:bg-[#f0f0fd] ${
                    i === activeClientIndex ? "bg-[#f0f0fd]" : ""
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#f0f0fd] text-[10px] font-semibold text-[#1a1a8a]">
                    {getInitials(client.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{client.name}</span>
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {clientMeta(client, why)}
                  </span>
                </button>
              ))}
              {clientOptions.length === 0 && (
                <span className="px-2 py-2.5 text-[13px] text-muted-foreground">
                  No existing client matches. Check the spelling or add it below.
                </span>
              )}
              {showAddNewClient && (
                <button
                  type="button"
                  onClick={() => {
                    setAddClientName(clientQuery.trim());
                    setClientMenuOpen(false);
                  }}
                  className={`mt-1 flex min-h-10 items-center gap-2.5 rounded-md border-t border-border px-2 py-1 text-left text-[13px] font-semibold text-[#2b2bb5] hover:bg-[#f0f0fd] ${
                    activeClientIndex === clientOptions.length ? "bg-[#f0f0fd]" : ""
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add “{clientQuery.trim()}” as a new client
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}
