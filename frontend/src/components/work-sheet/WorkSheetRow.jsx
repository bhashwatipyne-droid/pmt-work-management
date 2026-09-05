import { useEffect, useState } from "react";
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

export const WorkSheetRow = ({
  item,
  index,
  currentUser,
  users,
  options,
  projects = [],
  deliverables = [],
  onUpdate,
  selected,
  onToggleSelect,
  activeCell,
  onCellSelect,
  fillState,
  onFillStart,
  onFillHover,
  onFillEnd,
  selection,
}) => {
  const isMember = currentUser.role === "member";
  const isElevated = !isMember;
  const canEditRow = canEditWorkItem(currentUser, item, users);
  const canEditExtra = isElevated && canEditRow;
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

  const nameOf = (id) => users.find((u) => u.id === id)?.name || "Unassigned";
  const allowedStatuses = isMember ? options.member_forward_statuses : options.statuses;
  const projectDeliverables = deliverables.filter((d) => d.project_id === item.project_id);

  const sheetCell = (col) => ({
    "data-sheet-cell": true,
    "data-sheet-row": index,
    "data-sheet-col": col,
    onMouseDown: () => onCellSelect?.({ row: index, col }),
    onFocus: () => onCellSelect?.({ row: index, col }),
    onKeyDown: createWorksheetKeyHandler({
      row: index,
      col,
      maxCol: 13,
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
      <TableCell className={[
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
      <TableCell className={[
          "sheet-cell",
          isCellActive(1) && "sheet-cell-active",
          isCellInFillRange(1) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Select
          value={item.project_id || NONE_VALUE}
          onValueChange={(v) => {
            const nextId = v === NONE_VALUE ? null : v;
            const patch = { project_id: nextId };
            // clear deliverable if switching project
            if (nextId !== item.project_id) patch.deliverable_id = null;
            onUpdate(item.id, patch);
          }}
          disabled={!canEditRow}
        >
          <SelectTrigger
            {...sheetCell(1)}
            data-testid={`worksheet-project-select-${item.id}`}
            className="h-8 w-[160px]"
          >
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>—</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {renderFillHandle(1)}
      </TableCell>
      <TableCell className={[
          "sheet-cell",
          isCellActive(2) && "sheet-cell-active",
          isCellInFillRange(2) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Select
          value={item.deliverable_id || NONE_VALUE}
          onValueChange={(v) => onUpdate(item.id, { deliverable_id: v === NONE_VALUE ? null : v })}
          disabled={!canEditRow || !item.project_id}
        >
          <SelectTrigger
            {...sheetCell(2)}
            data-testid={`worksheet-deliverable-select-${item.id}`}
            className="h-8 w-[160px]"
          >
            <SelectValue placeholder={item.project_id ? "Deliverable" : "—"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>—</SelectItem>
            {projectDeliverables.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {renderFillHandle(2)}
      </TableCell>
      <TableCell className={[
          "sheet-cell",
          isCellActive(3) && "sheet-cell-active",
          isCellInFillRange(3) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Select
          value={item.stage || NONE_VALUE}
          onValueChange={(v) => onUpdate(item.id, { stage: v === NONE_VALUE ? null : v })}
          disabled={!canEditRow}
        >
          <SelectTrigger
            {...sheetCell(3)}
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
        {renderFillHandle(3)}
      </TableCell>
      <TableCell className={[
          "sheet-cell",
          isCellActive(4) && "sheet-cell-active",
          isCellInFillRange(4) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        {canEditExtra ? (
          <Input
            {...sheetCell(4)}
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
        {renderFillHandle(4)}
      </TableCell>
      <TableCell className={[
          "sheet-cell",
          isCellActive(5) && "sheet-cell-active",
          isCellInFillRange(5) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        {canEditRow ? (
          <Input
            {...sheetCell(5)}
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
        {renderFillHandle(5)}
      </TableCell>
      <TableCell className={[
          "sheet-cell",
          isCellActive(6) && "sheet-cell-active",
          isCellInFillRange(6) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        {canEditExtra ? (
          <Select value={item.deliverable_type || undefined} onValueChange={(v) => onUpdate(item.id, { deliverable_type: v })}>
            <SelectTrigger
              {...sheetCell(6)}
              data-testid={`${WORKSHEET.typeSelect}-${item.id}`}
              className="h-8 w-[150px]"
            >
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {options.deliverable_types?.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="cell-plain block">{item.deliverable_type || "—"}</span>
        )}
        {renderFillHandle(6)}
      </TableCell>
      <TableCell className={[
          "sheet-cell",
          isCellActive(7) && "sheet-cell-active",
          isCellInFillRange(7) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        {canEditExtra ? (
          <Select value={item.work_category} onValueChange={(v) => onUpdate(item.id, { work_category: v })}>
            <SelectTrigger
              {...sheetCell(7)}
              data-testid={`${WORKSHEET.categorySelect}-${item.id}`}
              className="h-8 w-[110px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.work_categories?.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="cell-plain block">{item.work_category}</span>
        )}
        {renderFillHandle(7)}
      </TableCell>
      <TableCell className={[
          "sheet-cell",
          isCellActive(8) && "sheet-cell-active",
          isCellInFillRange(8) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Input
          {...sheetCell(8)}
          data-testid={`${WORKSHEET.versionInput}-${item.id}`}
          value={local.version}
          disabled={!canEditRow}
          onChange={(e) => setLocal((l) => ({ ...l, version: e.target.value }))}
          onBlur={() => commit("version", local.version)}
          className="h-8 w-[80px]"
          placeholder="v1"
        />
        {renderFillHandle(8)}
      </TableCell>
      <TableCell className={[
          "sheet-cell",
          isCellActive(9) && "sheet-cell-active",
          isCellInFillRange(9) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Input
          {...sheetCell(9)}
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
        {renderFillHandle(9)}
      </TableCell>
      <TableCell className={[
          "sheet-cell",
          isCellActive(10) && "sheet-cell-active",
          isCellInFillRange(10) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        {canEditExtra ? (
          <Select value={item.creator_id || undefined} onValueChange={(v) => onUpdate(item.id, { creator_id: v })}>
            <SelectTrigger
              {...sheetCell(10)}
              data-testid={`${WORKSHEET.creatorSelect}-${item.id}`}
              className="h-8 w-[140px]"
            >
              <SelectValue placeholder="Creator" />
            </SelectTrigger>
            <SelectContent>
              {users.filter((u) => u.role !== "admin").map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="cell-plain block">{nameOf(item.creator_id)}</span>
        )}
        {renderFillHandle(10)}
      </TableCell>
      <TableCell className={[
          "sheet-cell",
          isCellActive(11) && "sheet-cell-active",
          isCellInFillRange(11) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        {canEditRow ? (
          <Select
            value={item.reviewer_id || NONE_VALUE}
            onValueChange={(v) => onUpdate(item.id, { reviewer_id: v === NONE_VALUE ? null : v })}
          >
            <SelectTrigger
              {...sheetCell(11)}
              data-testid={`${WORKSHEET.reviewerSelect}-${item.id}`}
              className="h-8 w-[140px]"
            >
              <SelectValue placeholder="Reviewer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Unassigned</SelectItem>
              {users.filter((u) => u.role !== "member").map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="cell-plain block">{item.reviewer_id ? nameOf(item.reviewer_id) : "Unassigned"}</span>
        )}
        {renderFillHandle(11)}
      </TableCell>
      <TableCell className={[
          "sheet-cell",
          isCellActive(12) && "sheet-cell-active",
          isCellInFillRange(12) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Textarea
          {...sheetCell(12)}
          data-testid={`${WORKSHEET.remarksInput}-${item.id}`}
          value={local.remarks}
          disabled={!canEditRow}
          onChange={(e) => setLocal((l) => ({ ...l, remarks: e.target.value }))}
          onBlur={() => commit("remarks", local.remarks)}
          className="min-h-[32px] h-8 w-[200px] resize-none py-1.5"
          rows={1}
        />
        {renderFillHandle(12)}
      </TableCell>
      <TableCell className={[
          "sheet-cell",
          isCellActive(13) && "sheet-cell-active",
          isCellInFillRange(13) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <Select value={item.status} onValueChange={(v) => onUpdate(item.id, { status: v })} disabled={!canEditRow}>
          <SelectTrigger
            {...sheetCell(13)}
            data-testid={`${WORKSHEET.statusSelect}-${item.id}`}
            className="h-8 w-[170px] border-none bg-transparent shadow-none p-0"
          >
            <SelectValue>
              <StatusBadge status={item.status} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.statuses?.map((s) => (
              <SelectItem key={s} value={s} disabled={!allowedStatuses?.includes(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {renderFillHandle(13)}
      </TableCell>
    </TableRow>
  );
};