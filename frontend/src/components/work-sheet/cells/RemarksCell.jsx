import { AutoGrowTextarea } from "../AutoGrowTextarea";
import { Maximize2 } from "lucide-react";
import { RemarksEditor } from "../RemarksEditor";
import { TableCell } from "@/components/ui/table";
import { WORKSHEET } from "@/constants/testIds";
import { toast } from "sonner";

// The "Remarks" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderRemarksCell(r) {
  const { canEditRow, cellProps, closeRemarks, commit, deliverableName, isCellActive, item, local, openRemarks, projectName, remarksOpen, remarksRef, renderFillHandle, setLocal, sheetCell } = r;
  return (
<TableCell {...cellProps(13, null, { onExpand: openRemarks })}>
  <AutoGrowTextarea
    {...sheetCell(13)}
    ref={remarksRef}
    data-testid={`${WORKSHEET.remarksInput}-${item.id}`}
    value={local.remarks}
    disabled={!canEditRow}
    onChange={(e) => setLocal((l) => ({ ...l, remarks: e.target.value }))}
    onBlur={() => commit("remarks", local.remarks)}
    onKeyDown={(event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        openRemarks();
        return;
      }
      sheetCell(13).onKeyDown(event);
    }}
    onDoubleClick={openRemarks}
    className="pr-8"
  />
  {(isCellActive(13) || (local.remarks || "").length > 28) && (
    <button
      type="button"
      tabIndex={-1}
      data-testid={`worksheet-remarks-expand-${item.id}`}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openRemarks();
      }}
      aria-label="Expand remarks"
      title={`Expand (${/Mac|iPhone|iPad/.test(navigator.platform || "") ? "⌘" : "Ctrl"} Enter)`}
      className={`absolute right-2 top-2 z-[3] flex h-[22px] w-[22px] items-center justify-center rounded-md border border-slate-200 bg-white transition-colors hover:bg-[#f0f0fd] hover:text-[#2b2bb5] ${
        isCellActive(13) ? "text-[#2b2bb5]" : "text-slate-400"
      }`}
    >
      <Maximize2 className="h-3 w-3" />
    </button>
  )}
  {remarksOpen && (
    <RemarksEditor
      anchorEl={remarksRef.current?.closest("[data-sheet-cell]")}
      rowLabel={item.deliverable_name || deliverableName || projectName || ""}
      value={local.remarks}
      readOnly={!canEditRow}
      onSave={(next) => {
        const trimmed = next.trim();
        setLocal((l) => ({ ...l, remarks: trimmed }));
        if (trimmed !== (item.remarks || "")) {
          commit("remarks", trimmed);
          toast.success("Remarks saved");
        }
        closeRemarks();
      }}
      onClose={closeRemarks}
    />
  )}
  {renderFillHandle(13)}
</TableCell>
  );
}
