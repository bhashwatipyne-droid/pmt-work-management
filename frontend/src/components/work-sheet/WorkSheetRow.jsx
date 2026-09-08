import { memo, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { TableCell, TableRow } from "../ui/table";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { StatusBadge } from "./StatusBadge";
import { WORKSHEET } from "@/constants/testIds";
import { canEditWorkItem } from "@/lib/worksheetPermissions";
import { createWorksheetKeyHandler } from "./useWorksheetKeyboardNavigation";

const NONE_VALUE = "__none__";
const STAGES = ["Content", "Design", "Animate", "Finish"];

export const WorkSheetRow = memo(function WorkSheetRow(props) {
  const {
    item,
    index,
    currentUser,
    users,
    usersById = {},
    nonAdminUsers = [],
    reviewerUsers = [],
    options,
    clients = [],
    projects = [],
    deliverablesByProject = {},
    onUpdate,
    onDelete,
    selected,
    onToggleSelect,
    activeCell,
    onCellSelect,
    fillState,
    onFillStart,
    onFillHover,
    onFillEnd,
    selection,
    hiddenColumns = [],
  } = props;
  const isMember = currentUser.role === "member";
  const isElevated = !isMember;
  const memberStage = {
    Content: "Content",
    Design: "Design",
    Animation: "Animate",
    Finish: "Finish",
  }[currentUser.department];
  const canEditRow = isMember
    ? (!item.stage || item.stage === memberStage)
    : canEditWorkItem(currentUser, item, users);
  const canEditExtra = isElevated && canEditRow;
  const [openSelect, setOpenSelect] = useState(null);

  const [local, setLocal] = useState({
    deliverable_name: item.deliverable_name,
    deliverable_link: item.deliverable_link,
    version: item.version,
    time_taken_minutes: item.time_taken_minutes,
    remarks: item.remarks,
  });

  useEffect(() => {
    setLocal({
      deliverable_name: item.deliverable_name,
      deliverable_link: item.deliverable_link,
      version: item.version,
      time_taken_minutes: item.time_taken_minutes,
      remarks: item.remarks,
    });
  }, [item.updated_at]);

  const nameOf = (id) => usersById[id]?.name || "Unassigned";
  const allowedStatuses = isMember ? options.member_forward_statuses : options.statuses;
  const project = item.project_id
    ? projects.find((p) => p.id === item.project_id)
    : undefined;
  const effectiveClientId = item.client_id || project?.client_id || undefined;
  const projectOptions = effectiveClientId
    ? projects.filter((p) => p.client_id === effectiveClientId)
    : projects;
  const projectDeliverables = deliverablesByProject[item.project_id] || [];
  const clientName = effectiveClientId
    ? clients.find((c) => c.id === effectiveClientId)?.name
    : undefined;

  const isColumnHidden = (column) =>
    hiddenColumns.includes(column);

  const COLUMN_NAMES = {
    0: "Date",
    1: "Client",
    2: "Project",
    3: "Deliverable",
    4: "Stage",
    5: "Deliverable Name",
    6: "Deliverable Link",
    7: "Type",
    8: "Category",
    9: "Version",
    10: "Time (min)",
    11: "Creator",
    12: "Reviewer",
    13: "Remarks",
    14: "Status",
  };

  const cellStyle = (col) => ({
    display: isColumnHidden(COLUMN_NAMES[col]) ? "none" : undefined,
  });

  // Lazy dropdown lists (below) only mount SelectItems for the open dropdown,
  // which keeps 700+ project/deliverable options from turning into tens of
  // thousands of React elements across all mounted rows. But Radix's
  // SelectValue normally resolves its displayed text by finding the matching
  // SelectItem in the tree — if that item was never mounted (row never
  // opened, or scrolled out and remounted by virtualization), it silently
  // falls back to the placeholder instead of showing the saved value. So for
  // every lazy dropdown we pass the label to SelectValue explicitly instead
  // of relying on that lookup.
  const projectName = item.project_id
    ? projects.find((p) => p.id === item.project_id)?.name
    : undefined;

  const deliverableName = item.deliverable_id
    ? projectDeliverables.find((d) => d.id === item.deliverable_id)?.name
    : undefined;

  const sheetCell = (col) => ({
    "data-sheet-cell": true,
    "data-sheet-row": index,
    "data-sheet-col": col,
    onMouseDown: () => onCellSelect?.({ row: index, col }),
    onFocus: () => onCellSelect?.({ row: index, col }),
    onKeyDown: createWorksheetKeyHandler({
      row: index,
      col,
      maxCol: 14,
    }),
  });

  const commit = (field, value) => {
    if (item[field] === value) return;
    onUpdate(item.id, { [field]: value });
  };

  const isCellActive = (col) =>
    activeCell?.row === index && activeCell?.col === col;

  const isCellInFillRange = (col) => {
    if (!selection) return false;

    return (
      selection.col === col &&
      index >= Math.min(selection.startRow, selection.endRow) &&
      index <= Math.max(selection.startRow, selection.endRow)
    );
  };

  const renderFillHandle = (col) => {
    if (!isCellActive(col) || !canEditRow) return null;

    return (
      <span
        className="sheet-fill-handle"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onFillStart?.({ row: index, col });
        }}
      />
    );
  };

  return (
    <TableRow
      data-testid={`worksheet-row-${item.id}`}
      className="group"
      onPointerEnter={() => {
        if (fillState) {
          onFillHover?.(index);
        }
      }}
      onMouseEnter={() => {
        if (fillState) {
          onFillHover?.(index);
        }
      }}
      onMouseUp={() => {
        if (fillState) {
          onFillEnd?.();
        }
      }}
    >
      <TableCell className="row-num">{index}</TableCell>
      <TableCell className="checkbox-cell">
        <Checkbox
          data-testid={`worksheet-row-checkbox-${item.id}`}
          checked={selected}
          disabled={!canEditRow}
          onCheckedChange={() => onToggleSelect(item.id)}
        />
      </TableCell>
      <TableCell
        style={cellStyle(0)}
        className={[
          "sheet-cell",
          isCellActive(0) && "sheet-cell-active",
          isCellInFillRange(0) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Input
          {...sheetCell(0)}
          data-testid={`${WORKSHEET.dateInput}-${item.id}`}
          type="date"
          value={item.work_date}
          disabled={!canEditRow}
          onChange={(e) => onUpdate(item.id, { work_date: e.target.value })}
          className="h-8 w-[130px]"
        />

        {renderFillHandle(0)}
      </TableCell>
      <TableCell
        style={cellStyle(1)}
        className={[
          "sheet-cell",
          isCellActive(1) && "sheet-cell-active",
          isCellInFillRange(1) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Select
          open={openSelect === "client"}
          onOpenChange={(open) => setOpenSelect(open ? "client" : null)}
          value={effectiveClientId || NONE_VALUE}
          onValueChange={(v) => {
            const nextClientId = v === NONE_VALUE ? null : v;
            onUpdate(item.id, {
              client_id: nextClientId,
              project_id: null,
              deliverable_id: null,
            });
            if (nextClientId) {
              localStorage.setItem("ws_last_client_id", nextClientId);
            } else {
              localStorage.removeItem("ws_last_client_id");
            }
            localStorage.removeItem("ws_last_project_id");
            localStorage.removeItem("ws_last_deliverable_id");
          }}
          disabled={!canEditRow}
        >
          <SelectTrigger
            {...sheetCell(1)}
            data-testid={`worksheet-client-select-${item.id}`}
            className="h-8 w-[150px]"
          >
            <SelectValue placeholder="Client">
              {effectiveClientId ? (clientName ?? "Client") : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>—</SelectItem>
            {openSelect === "client" && clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {renderFillHandle(1)}
      </TableCell>
      <TableCell
        style={cellStyle(2)}
        className={[
          "sheet-cell",
          isCellActive(2) && "sheet-cell-active",
          isCellInFillRange(2) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Select
          open={openSelect === "project"}
          onOpenChange={(open) => setOpenSelect(open ? "project" : null)}
          value={item.project_id || NONE_VALUE}
          onValueChange={(v) => {
            const nextId = v === NONE_VALUE ? null : v;
            const selectedProject = projects.find((p) => p.id === nextId);
            const patch = {
              project_id: nextId,
              client_id: selectedProject?.client_id || effectiveClientId || null,
            };
            // clear deliverable if switching project
            if (nextId !== item.project_id) patch.deliverable_id = null;
            onUpdate(item.id, patch);
          }}
          disabled={!canEditRow}
        >
          <SelectTrigger
            {...sheetCell(2)}
            data-testid={`worksheet-project-select-${item.id}`}
            className="h-8 w-[160px]"
          >
            <SelectValue placeholder="Project">
              {item.project_id ? (projectName ?? "Project") : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>—</SelectItem>
            {openSelect === "project" && projectOptions.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {renderFillHandle(2)}
      </TableCell>
      <TableCell
        style={cellStyle(3)}
        className={[
          "sheet-cell",
          isCellActive(3) && "sheet-cell-active",
          isCellInFillRange(3) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Select
          open={openSelect === "deliverable"}
          onOpenChange={(open) => setOpenSelect(open ? "deliverable" : null)}
          value={item.deliverable_id || NONE_VALUE}
          onValueChange={(v) => onUpdate(item.id, { deliverable_id: v === NONE_VALUE ? null : v })}
          disabled={!canEditRow || !item.project_id}
        >
          <SelectTrigger
            {...sheetCell(3)}
            data-testid={`worksheet-deliverable-select-${item.id}`}
            className="h-8 w-[160px]"
          >
            <SelectValue placeholder={item.project_id ? "Deliverable" : "—"}>
              {item.deliverable_id ? (deliverableName ?? "Deliverable") : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>—</SelectItem>
            {openSelect === "deliverable" && projectDeliverables.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {renderFillHandle(3)}
      </TableCell>
      <TableCell
        style={cellStyle(4)}
        className={[
          "sheet-cell",
          isCellActive(4) && "sheet-cell-active",
          isCellInFillRange(4) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Select
          open={openSelect === "stage"}
          onOpenChange={(open) => setOpenSelect(open ? "stage" : null)}
          value={item.stage || NONE_VALUE}
          onValueChange={(v) => onUpdate(item.id, { stage: v === NONE_VALUE ? null : v })}
          disabled={!canEditRow}
        >
          <SelectTrigger
            {...sheetCell(4)}
            data-testid={`worksheet-stage-select-${item.id}`}
            className="h-8 w-[110px]"
          >
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>—</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {renderFillHandle(4)}
      </TableCell>
      <TableCell
        style={cellStyle(5)}
        className={[
          "sheet-cell",
          isCellActive(5) && "sheet-cell-active",
          isCellInFillRange(5) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        {canEditRow ? (
          <Input
            {...sheetCell(5)}
            data-testid={`${WORKSHEET.deliverableInput}-${item.id}`}
            value={local.deliverable_name}
            onChange={(e) => setLocal((l) => ({ ...l, deliverable_name: e.target.value }))}
            onBlur={() => commit("deliverable_name", local.deliverable_name)}
            className="h-8 w-[180px]"
            placeholder="Deliverable name"
          />
        ) : (
          <span className="cell-plain block">{item.deliverable_name || "—"}</span>
        )}
        {renderFillHandle(5)}
      </TableCell>
      <TableCell
        style={cellStyle(6)}
        className={[
          "sheet-cell",
          isCellActive(6) && "sheet-cell-active",
          isCellInFillRange(6) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        {canEditRow ? (
          <Input
            {...sheetCell(6)}
            data-testid={`${WORKSHEET.deliverableLinkInput}-${item.id}`}
            value={local.deliverable_link}
            onChange={(e) => setLocal((l) => ({ ...l, deliverable_link: e.target.value }))}
            onBlur={() => commit("deliverable_link", local.deliverable_link)}
            className="h-8 w-[180px]"
            placeholder="Paste drive link"
          />
        ) : item.deliverable_link ? (
          <a href={item.deliverable_link} target="_blank" rel="noreferrer" className="cell-plain block truncate text-indigo-600 underline">
            {item.deliverable_link}
          </a>
        ) : (
          <span className="cell-plain block">—</span>
        )}
        {renderFillHandle(6)}
      </TableCell>
      <TableCell
        style={cellStyle(7)}
        className={[
          "sheet-cell",
          isCellActive(7) && "sheet-cell-active",
          isCellInFillRange(7) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        {canEditExtra ? (
          <Select
            open={openSelect === "type"}
            onOpenChange={(open) => setOpenSelect(open ? "type" : null)}
            value={item.deliverable_type || undefined}
            onValueChange={(v) => {
              const category =
                options.deliverable_type_categories?.[v] || "";

              onUpdate(item.id, {
                deliverable_type: v,
                work_category: category,
              });
            }}
          >
            <SelectTrigger
              {...sheetCell(7)}
              data-testid={`${WORKSHEET.typeSelect}-${item.id}`}
              className="h-8 w-[150px]"
            >
              <SelectValue placeholder="Type">
                {item.deliverable_type || undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {openSelect === "type" && options.deliverable_types?.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="cell-plain block">{item.deliverable_type || "—"}</span>
        )}
        {renderFillHandle(7)}
      </TableCell>
      <TableCell
        style={cellStyle(8)}
        className={[
          "sheet-cell",
          isCellActive(8) && "sheet-cell-active",
          isCellInFillRange(8) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <span
          data-testid={`${WORKSHEET.categorySelect}-${item.id}`}
          className="cell-plain block"
        >
          {item.work_category || "—"}
        </span>
        {renderFillHandle(8)}
      </TableCell>
      <TableCell
        style={cellStyle(9)}
        className={[
          "sheet-cell",
          isCellActive(9) && "sheet-cell-active",
          isCellInFillRange(9) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Input
          {...sheetCell(9)}
          data-testid={`${WORKSHEET.versionInput}-${item.id}`}
          value={local.version}
          disabled={!canEditRow}
          onChange={(e) => setLocal((l) => ({ ...l, version: e.target.value }))}
          onBlur={() => commit("version", local.version)}
          className="h-8 w-[80px]"
          placeholder="v1"
        />
        {renderFillHandle(9)}
      </TableCell>
      <TableCell
        style={cellStyle(10)}
        className={[
          "sheet-cell",
          isCellActive(10) && "sheet-cell-active",
          isCellInFillRange(10) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Input
          {...sheetCell(10)}
          data-testid={`${WORKSHEET.timeInput}-${item.id}`}
          type="number"
          min="0"
          step="5"
          value={local.time_taken_minutes}
          disabled={!canEditRow}
          onChange={(e) => setLocal((l) => ({ ...l, time_taken_minutes: e.target.value }))}
          onBlur={() => commit("time_taken_minutes", Number(local.time_taken_minutes) || 0)}
          className="h-8 w-[80px]"
        />
        {renderFillHandle(10)}
      </TableCell>
      <TableCell
        style={cellStyle(11)}
        className={[
          "sheet-cell",
          isCellActive(11) && "sheet-cell-active",
          isCellInFillRange(11) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        {canEditExtra ? (
          <Select
            open={openSelect === "creator"}
            onOpenChange={(open) => setOpenSelect(open ? "creator" : null)}
            value={item.creator_id || undefined}
            onValueChange={(v) => onUpdate(item.id, { creator_id: v })}
          >
            <SelectTrigger
              {...sheetCell(11)}
              data-testid={`${WORKSHEET.creatorSelect}-${item.id}`}
              className="h-8 w-[140px]"
            >
              <SelectValue placeholder="Creator">
                {item.creator_id ? nameOf(item.creator_id) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {openSelect === "creator" && nonAdminUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="cell-plain block">{nameOf(item.creator_id)}</span>
        )}
        {renderFillHandle(11)}
      </TableCell>
      <TableCell
        style={cellStyle(12)}
        className={[
          "sheet-cell",
          isCellActive(12) && "sheet-cell-active",
          isCellInFillRange(12) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        {canEditRow ? (
          <Select
            open={openSelect === "reviewer"}
            onOpenChange={(open) => setOpenSelect(open ? "reviewer" : null)}
            value={item.reviewer_id || NONE_VALUE}
            onValueChange={(v) => onUpdate(item.id, { reviewer_id: v === NONE_VALUE ? null : v })}
          >
            <SelectTrigger
              {...sheetCell(12)}
              data-testid={`${WORKSHEET.reviewerSelect}-${item.id}`}
              className="h-8 w-[140px]"
            >
              <SelectValue placeholder="Reviewer">
                {item.reviewer_id ? nameOf(item.reviewer_id) : "Unassigned"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Unassigned</SelectItem>
              {openSelect === "reviewer" && reviewerUsers.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="cell-plain block">{item.reviewer_id ? nameOf(item.reviewer_id) : "Unassigned"}</span>
        )}
        {renderFillHandle(12)}
      </TableCell>
      <TableCell
        style={cellStyle(13)}
        className={[
          "sheet-cell",
          isCellActive(13) && "sheet-cell-active",
          isCellInFillRange(13) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Textarea
          {...sheetCell(13)}
          data-testid={`${WORKSHEET.remarksInput}-${item.id}`}
          value={local.remarks}
          disabled={!canEditRow}
          onChange={(e) => setLocal((l) => ({ ...l, remarks: e.target.value }))}
          onBlur={() => commit("remarks", local.remarks)}
          className="min-h-[32px] h-8 w-[200px] resize-none py-1.5"
          rows={1}
        />
        {renderFillHandle(13)}
      </TableCell>
      <TableCell
        style={cellStyle(14)}
        className={[
          "sheet-cell",
          isCellActive(14) && "sheet-cell-active",
          isCellInFillRange(14) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Select
          open={openSelect === "status"}
          onOpenChange={(open) => setOpenSelect(open ? "status" : null)}
          value={item.status}
          onValueChange={(v) => onUpdate(item.id, { status: v })}
          disabled={!canEditRow}
        >
          <SelectTrigger
            {...sheetCell(14)}
            data-testid={`${WORKSHEET.statusSelect}-${item.id}`}
            className="h-8 w-[170px] border-none bg-transparent shadow-none p-0"
          >
            <SelectValue>
              <StatusBadge status={item.status} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {openSelect === "status" && options.statuses?.map((s) => (
              <SelectItem key={s} value={s} disabled={!allowedStatuses?.includes(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {renderFillHandle(14)}
      </TableCell>

      <TableCell className="sheet-cell w-[52px] text-center">
        {canEditRow && (
          <button
            type="button"
            onClick={() => onDelete?.(item)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            title="Delete entry"
            aria-label="Delete entry"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </TableCell>
    </TableRow>
  );
});