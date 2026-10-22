import { DeliverableMultiPicker } from "../DeliverableMultiPicker";
import { NOT_AVAILABLE_LABEL, NOT_AVAILABLE_VALUE } from "@/lib/deliverableRules";
import { SearchableSelect } from "../SearchableSelect";
import { TableCell } from "@/components/ui/table";
import { deliverableIdsOf, deliverableListPatch, pickDeliverablePatch, typeChangePatch } from "@/lib/quantity";
import { searchDeliverables } from "@/lib/deliverableSearch";
import { toast } from "sonner";

// Picking a deliverable fills the row's Deliverable Type from the deliverable's
// own type. When that replaces a type the person had already set, say so and
// offer to keep the old one, so an auto-fill is never a one-way change.
export function offerKeepType(item, patch, categories, onUpdate) {
  const previous = item.deliverable_type;
  if (!previous || patch.deliverable_type === undefined || patch.deliverable_type === previous) return;
  toast(`Deliverable Type changed to ${patch.deliverable_type}`, {
    action: {
      label: `Keep ${previous}`,
      onClick: () =>
        onUpdate(item.id, typeChangePatch({ ...item, ...patch }, previous, categories)),
    },
  });
}

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
        const pickPatch = pickDeliverablePatch(item, picked, {
          types: options.deliverable_types || [],
          categories: options.deliverable_type_categories || {},
        });
        onUpdate(item.id, pickPatch);
        offerKeepType(item, pickPatch, options.deliverable_type_categories || {}, onUpdate);
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
      // Every typed word must match (any order, plural or not, client
      // initials like "absl" count) and the newest deliverables come first.
      if (search.trim().length < 2) return null;
      const candidates = [];
      for (const project of projects) {
        if (project.id === item.project_id) continue;
        const clientName = clientNameOf(project.client_id);
        for (const deliverable of deliverablesByProject[project.id] || []) {
          candidates.push({ project, deliverable, clientName });
        }
      }
      const matches = searchDeliverables(search, candidates);
      const items = [];
      for (const { project, deliverable } of matches) {
        {
          const client = clientNameOf(project.client_id);
          items.push({
            key: `other-${project.id}-${deliverable.id}`,
            label: deliverable.name,
            sub: client ? `${client} · ${project.name}` : project.name,
            chip: deliverable.type || "",
            onSelect: () => {
              // Switches the row's project and client along with it.
              const otherPickPatch = pickDeliverablePatch(item, deliverable, {
                types: options.deliverable_types || [],
                categories: options.deliverable_type_categories || {},
              });
              onUpdate(item.id, {
                project_id: project.id,
                client_id: project.client_id,
                ...otherPickPatch,
              });
              offerKeepType(item, otherPickPatch, options.deliverable_type_categories || {}, onUpdate);
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
