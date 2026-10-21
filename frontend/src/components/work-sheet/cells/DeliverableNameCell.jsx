import { AutoGrowTextarea } from "../AutoGrowTextarea";
import { Maximize2 } from "lucide-react";
import { RemarksEditor } from "../RemarksEditor";
import { TableCell } from "@/components/ui/table";
import { WORKSHEET } from "@/constants/testIds";
import { toast } from "sonner";

// The "Deliverable Name" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderDeliverableNameCell(r) {
  const { canEditRow, cellProps, clientName, closeName, commit, isCellActive, item, local, nameOpen, nameRef, openName, projectName, renderFillHandle, setLocal, sheetCell } = r;
  return (
<TableCell {...cellProps(5, null, { onExpand: canEditRow ? openName : undefined })}>
  {canEditRow ? (
    <AutoGrowTextarea
      {...sheetCell(5)}
      ref={nameRef}
      data-testid={`${WORKSHEET.deliverableInput}-${item.id}`}
      value={local.deliverable_name}
      onChange={(e) =>
        // A name is one line however long it is; Enter moves down the
        // sheet, so a pasted line break becomes a space.
        setLocal((l) => ({ ...l, deliverable_name: e.target.value.replace(/\s*[\r\n]+\s*/g, " ") }))
      }
      onBlur={() => commit("deliverable_name", local.deliverable_name)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          event.stopPropagation();
          openName();
          return;
        }
        sheetCell(5).onKeyDown(event);
      }}
      className="pr-8"
      placeholder="Deliverable name"
    />
  ) : (
    <span className="cell-plain block">{item.deliverable_name || "—"}</span>
  )}
  {canEditRow && (isCellActive(5) || (local.deliverable_name || "").length > 30) && (
    <button
      type="button"
      tabIndex={-1}
      data-testid={`worksheet-name-expand-${item.id}`}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openName();
      }}
      aria-label="Expand deliverable name"
      title={`Expand (${/Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘" : "Ctrl"} Enter)`}
      className={`absolute right-2 top-2 z-[3] flex h-[22px] w-[22px] items-center justify-center rounded-md border border-slate-200 bg-white transition-colors hover:bg-[#f0f0fd] hover:text-[#2b2bb5] ${
        isCellActive(5) ? "text-[#2b2bb5]" : "text-slate-400"
      }`}
    >
      <Maximize2 className="h-3 w-3" />
    </button>
  )}
  {nameOpen && (
    <RemarksEditor
      anchorEl={nameRef.current?.closest("[data-sheet-cell]")}
      rowLabel={projectName || clientName || ""}
      title="Deliverable"
      placeholder="Deliverable name"
      value={local.deliverable_name}
      readOnly={!canEditRow}
      onSave={(next) => {
        const normalized = next.replace(/\s*[\r\n]+\s*/g, " ").trim();
        setLocal((l) => ({ ...l, deliverable_name: normalized }));
        if (normalized !== (item.deliverable_name || "")) {
          commit("deliverable_name", normalized);
          toast.success("Deliverable name saved");
        }
        closeName();
      }}
      onClose={closeName}
    />
  )}
  {renderFillHandle(5)}
</TableCell>
  );
}
