import { SearchableSelect } from "../SearchableSelect";
import { TableCell } from "@/components/ui/table";

// The "Client" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderClientCell(r) {
  const { NONE_VALUE, canEditRow, cellProps, clients, effectiveClientId, item, noDeliverables, onUpdate, openSelect, renderFillHandle, setOpenSelect, sheetCell } = r;
  return (
<TableCell {...cellProps(1)}>
  <SearchableSelect
    open={openSelect === "client"}
    onOpenChange={(open) => setOpenSelect(open ? "client" : null)}
    value={effectiveClientId ? String(effectiveClientId) : NONE_VALUE}
    onValueChange={(v) => {
      const nextClientId = v === NONE_VALUE ? null : v;
      onUpdate(item.id, {
        client_id: nextClientId,
        project_id: null,
        deliverable_id: null,
        deliverable_not_available: false,
        ...noDeliverables(),
      });
      if (nextClientId) localStorage.setItem("ws_last_client_id", nextClientId);
      else localStorage.removeItem("ws_last_client_id");
      localStorage.removeItem("ws_last_project_id");
      localStorage.removeItem("ws_last_deliverable_id");
    }}
    options={[
      { value: NONE_VALUE, label: "—" },
      ...clients.map((client) => ({ value: String(client.id), label: client.name })),
    ]}
    placeholder="Client"
    searchPlaceholder="Type client name..."
    emptyText="No clients found"
    disabled={!canEditRow}
    triggerProps={sheetCell(1)}
    data-testid={`worksheet-client-select-${item.id}`}
    contentClassName="w-[300px] p-0"
  />
  {renderFillHandle(1)}
</TableCell>
  );
}
