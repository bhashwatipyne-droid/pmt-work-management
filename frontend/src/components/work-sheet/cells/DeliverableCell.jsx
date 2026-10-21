import { DeliverableMultiPicker } from "../DeliverableMultiPicker";
import { NOT_AVAILABLE_LABEL, NOT_AVAILABLE_VALUE } from "@/lib/deliverableRules";
import { SearchableSelect } from "../SearchableSelect";
import { TableCell } from "@/components/ui/table";
import { deliverableIdsOf, deliverableListPatch, pickDeliverablePatch } from "@/lib/quantity";
import { toast } from "sonner";

// The "Deliverable" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderDeliverableCell(r) {
  const { NONE_VALUE, canEditRow, cellProps, clientNameOf, deliverableMissing, deliverablesByProject, item, multiDeliverable, noDeliverables, onUpdate, openSelect, options, projectDeliverables, projects, renderFillHandle, setOpenSelect, sheetCell } = r;
  return (
<TableCell {...cellProps(3, deliverableMissing && "shadow-[inset_2px_0_0_#fb7185]")}>
  {multiDeliverable ? (
  <DeliverableMultiPicker
    open={openSelect === "deliverable"}
    onOpenChange={(open) => setOpenSelect(open ? "deliverable" : null)}
    options={projectDeliverables}
    selectedIds={deliverableIdsOf(item)}
    notAvailable={Boolean(item.deliverable_not_available)}
    missing={deliverableMissing}
    showNotAvailable={Boolean(item.project_id)}
    placeholder={item.project_id ? "Deliverable" : "Select project first"}
    disabled={!canEditRow || !item.project_id}
    triggerProps={sheetCell(3)}
    data-testid={`worksheet-deliverable-select-${item.id}`}
    onCommit={(ids, notAvailable) => {
      if (notAvailable) {
        // No matching deliverable exists yet: saving this notifies the
        // admins to check the project's deliverables and add it.
        onUpdate(item.id, {
          deliverable_id: null,
          deliverable_not_available: true,
          ...noDeliverables(),
        });
        return;
      }
      onUpdate(item.id, deliverableListPatch(item, ids));
    }}
  />
  ) : (
  <SearchableSelect
    open={openSelect === "deliverable"}
    onOpenChange={(open) => setOpenSelect(open ? "deliverable" : null)}
    value={
      item.deliverable_not_available
        ? NOT_AVAILABLE_VALUE
        : item.deliverable_id
          ? String(item.deliverable_id)
          : NONE_VALUE
    }
    onValueChange={(v) => {
      if (v === NOT_AVAILABLE_VALUE) {
        // No matching deliverable exists yet: saving this notifies the
        // admins to check the project's deliverables and add it.
        onUpdate(item.id, { deliverable_id: null, deliverable_not_available: true });
        return;
      }
      const picked = v === NONE_VALUE ? null : projectDeliverables.find((d) => String(d.id) === String(v));
      if (picked) {
        // The deliverable's type fills the row's Deliverable Type too.
        onUpdate(
          item.id,
          pickDeliverablePatch(item, picked, {
            types: options.deliverable_types || [],
            categories: options.deliverable_type_categories || {},
          })
        );
        return;
      }
      onUpdate(item.id, {
        deliverable_id: v === NONE_VALUE ? null : v,
        deliverable_not_available: false,
      });
    }}
    options={[
      { value: NONE_VALUE, label: "—" },
      ...projectDeliverables.map((deliverable) => ({
        value: String(deliverable.id),
        label: deliverable.name,
        chip: deliverable.type || "",
      })),
      // Last on purpose: people should look for the real deliverable first.
      ...(item.project_id ? [{ value: NOT_AVAILABLE_VALUE, label: NOT_AVAILABLE_LABEL }] : []),
    ]}
    renderValue={(option, value) => {
      if (value === NOT_AVAILABLE_VALUE) {
        return <span className="font-medium text-amber-700">{NOT_AVAILABLE_LABEL}</span>;
      }
      if (deliverableMissing) {
        return <span className="text-rose-500">Required</span>;
      }
      return option?.label || (value ? String(value) : (item.project_id ? "Deliverable" : "Select project first"));
    }}
    placeholder={item.project_id ? "Deliverable" : "Select project first"}
    searchPlaceholder="Type deliverable name..."
    emptyText="No deliverables found for this project"
    disabled={!canEditRow || !item.project_id}
    triggerProps={sheetCell(3)}
    data-testid={`worksheet-deliverable-select-${item.id}`}
    contentClassName="w-[460px] p-0"
    extraGroup={(search) => {
      // People remember the deliverable but not always which project it
      // sits under (e.g. "ABSL Alternates" vs a similar ABSL project), so
      // a search also looks through every other project's deliverables.
      const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (search.trim().length < 2) return null;
      // The client picked may itself be wrong (e.g. "Aditya Birla Sun
      // Life" for "Aditya Birla Alternative"), so rank matches: same
      // client first, then clients whose names share a word with it,
      // then everyone else.
      const tokensOf = (name) =>
        new Set(
          String(name || "")
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((t) => t.length > 2 && !["ltd", "pvt", "the", "and", "limited"].includes(t))
        );
      const rowClientTokens = tokensOf(clientNameOf(item.client_id));
      const clientRank = (clientId) => {
        if (item.client_id && String(clientId) === String(item.client_id)) return 0;
        for (const t of tokensOf(clientNameOf(clientId))) {
          if (rowClientTokens.has(t)) return 1;
        }
        return 2;
      };
      const matches = [];
      for (const project of projects) {
        if (project.id === item.project_id) continue;
        for (const deliverable of deliverablesByProject[project.id] || []) {
          const hay = `${deliverable.name} ${project.name} ${clientNameOf(project.client_id)}`.toLowerCase();
          if (!words.every((w) => hay.includes(w))) continue;
          matches.push({ project, deliverable, rank: clientRank(project.client_id) });
        }
      }
      matches.sort((a, b) => a.rank - b.rank);
      const items = [];
      for (const { project, deliverable } of matches.slice(0, 8)) {
        {
          const client = clientNameOf(project.client_id);
          items.push({
            key: `other-${project.id}-${deliverable.id}`,
            label: deliverable.name,
            sub: client ? `${client} · ${project.name}` : project.name,
            chip: deliverable.type || "",
            onSelect: () => {
              // Switches the row's project and client along with it.
              onUpdate(item.id, {
                project_id: project.id,
                client_id: project.client_id,
                ...pickDeliverablePatch(item, deliverable, {
                  types: options.deliverable_types || [],
                  categories: options.deliverable_type_categories || {},
                }),
              });
              const newClient = clientNameOf(project.client_id);
              toast(
                String(project.client_id) !== String(item.client_id) && newClient
                  ? `Client changed to ${newClient}, project to ${project.name}`
                  : `Project changed to ${project.name}`
              );
            },
          });
        }
      }
      return { heading: "In other projects & clients", items };
    }}
  />
  )}
  {renderFillHandle(3)}
</TableCell>
  );
}
