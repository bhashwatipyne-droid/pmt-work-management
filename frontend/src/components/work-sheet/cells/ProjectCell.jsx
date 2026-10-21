import { ProjectPicker } from "../ProjectPicker";
import { TableCell } from "@/components/ui/table";
import { pickDeliverablePatch } from "@/lib/quantity";
import { toast } from "sonner";

// The "Project" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderProjectCell(r) {
  const { canEditRow, cellProps, clientNameOf, deliverablesByProject, effectiveClientId, isRecentProject, item, lookalikes, noDeliverables, onUpdate, openSelect, options, projects, renderFillHandle, setOpenSelect, sheetCell } = r;
  return (
<TableCell {...cellProps(2)}>
  <ProjectPicker
    open={openSelect === "project"}
    onOpenChange={(open) => setOpenSelect(open ? "project" : null)}
    value={item.project_id}
    projects={projects}
    clientId={effectiveClientId}
    clientNameOf={clientNameOf}
    isRecent={isRecentProject}
    lookalikes={lookalikes}
    deliverablesByProject={deliverablesByProject}
    onPick={(picked, deliverable) => {
      // Picking a project also sets its client, so a new row can start
      // from the project.
      const patch = { project_id: picked.id, client_id: picked.client_id };
      if (deliverable) {
        // Project, deliverable and the deliverable's type all at once.
        Object.assign(
          patch,
          pickDeliverablePatch(item, deliverable, {
            types: options.deliverable_types || [],
            categories: options.deliverable_type_categories || {},
          })
        );
      } else if (picked.id !== item.project_id) {
        patch.deliverable_id = null;
        patch.deliverable_not_available = false;
        Object.assign(patch, noDeliverables());
      }
      onUpdate(item.id, patch);

      const twins = lookalikes?.get(picked.id) || [];
      if (item.client_id && String(picked.client_id) !== String(item.client_id)) {
        toast(`Client changed to ${clientNameOf(picked.client_id)}`);
      } else if (twins.length) {
        toast(`Set to ${picked.name}, not ${twins[0].name}`);
      }
    }}
    disabled={!canEditRow}
    triggerProps={sheetCell(2)}
    data-testid={`worksheet-project-select-${item.id}`}
  />
  {renderFillHandle(2)}
</TableCell>
  );
}
