import { Fragment, memo, useEffect, useState } from "react";
import { GripVertical, Trash2 } from "lucide-react";
import { TableCell, TableRow } from "../ui/table";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { SearchableSelect } from "./SearchableSelect";
import { StatusBadge } from "./StatusBadge";
import { WORKSHEET } from "@/constants/testIds";
import { canEditWorkItem } from "@/lib/worksheetPermissions";
import { createWorksheetKeyHandler } from "./useWorksheetKeyboardNavigation";

const NONE_VALUE = "__none__";
const STAGES = ["Content", "Design", "Animate", "Finish"];

const COLUMN_WIDTHS = {
  Date: "130px",
  Client: "150px",
  Project: "160px",
  Deliverable: "160px",
  Stage: "110px",
  "Deliverable Name": "180px",
  "Deliverable Link": "180px",
  Type: "150px",
  Category: "140px",
  Version: "80px",
  "Time (min)": "80px",
  Creator: "140px",
  Reviewer: "140px",
  Remarks: "200px",
  Status: "170px",
};

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
    columnOrder = [],
    onRowDragStart,
    onRowDragOver,
    onRowDrop,
    onRowDragEnd,
    isRowDragging = false,
    canDragRow = true,
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

  const orderedColumns = columnOrder.length
    ? columnOrder
    : Object.values(COLUMN_NAMES);
  const visibleColumns = orderedColumns.filter(
    (column) => !isColumnHidden(column)
  );

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

  const clearCell = (col) => {
    if (!canEditRow) return;

    const fields = {
      0: "work_date",
      1: "client_id",
      2: "project_id",
      3: "deliverable_id",
      4: "stage",
      5: "deliverable_name",
      6: "deliverable_link",
      7: "deliverable_type",
      8: "work_category",
      9: "version",
      10: "time_taken_minutes",
      11: "creator_id",
      12: "reviewer_id",
      13: "remarks",
      14: "status",
    };

    const field = fields[col];
    if (!field) return;

    const values = {
      work_date: "",
      client_id: null,
      project_id: null,
      deliverable_id: null,
      stage: null,
      deliverable_name: "",
      deliverable_link: "",
      deliverable_type: "",
      work_category: "",
      version: "",
      time_taken_minutes: 0,
      creator_id: null,
      reviewer_id: null,
      remarks: "",
      // Members cannot clear status through the API; Not Started is the
      // neutral editable value and behaves like a reset for this cell.
      status: "Not Started",
    };

    if (field === "client_id") {
      onUpdate(item.id, {
        client_id: null,
        project_id: null,
        deliverable_id: null,
      });
      localStorage.removeItem("ws_last_client_id");
      localStorage.removeItem("ws_last_project_id");
      localStorage.removeItem("ws_last_deliverable_id");
      return;
    }

    if (field === "project_id") {
      onUpdate(item.id, { project_id: null, deliverable_id: null });
      localStorage.removeItem("ws_last_project_id");
      localStorage.removeItem("ws_last_deliverable_id");
      return;
    }

    if (field === "deliverable_type" || field === "work_category") {
      onUpdate(item.id, { deliverable_type: "", work_category: "" });
      return;
    }

    if (field === "deliverable_name") {
      setLocal((current) => ({ ...current, deliverable_name: "" }));
    }
    if (field === "deliverable_link") {
      setLocal((current) => ({ ...current, deliverable_link: "" }));
    }
    if (field === "version") {
      setLocal((current) => ({ ...current, version: "" }));
    }
    if (field === "time_taken_minutes") {
      setLocal((current) => ({ ...current, time_taken_minutes: 0 }));
    }
    if (field === "remarks") {
      setLocal((current) => ({ ...current, remarks: "" }));
    }

    onUpdate(item.id, { [field]: values[field] });
  };

  const sheetCell = (col) => {
    const visualCol = visibleColumns.indexOf(COLUMN_NAMES[col]);
    const navigationCol = visualCol === -1 ? col : visualCol;

    return {
      "data-sheet-cell": true,
      "data-sheet-row": index,
      "data-sheet-col": navigationCol,
      onMouseDown: () => onCellSelect?.({ row: index, col: navigationCol }),
      onFocus: () => onCellSelect?.({ row: index, col: navigationCol }),
      onKeyDown: (event) => {
        if (event.key === "Delete" && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          clearCell(col);
          return;
        }

        return createWorksheetKeyHandler({
          row: index,
          col: navigationCol,
          maxCol: Math.max(0, visibleColumns.length - 1),
        })(event);
      },
    };
  };

  const commit = (field, value) => {
    if (item[field] === value) return;
    onUpdate(item.id, { [field]: value });
  };

  const isCellActive = (col) => {
    const visualCol = visibleColumns.indexOf(COLUMN_NAMES[col]);
    return activeCell?.row === index && activeCell?.col === visualCol;
  };

  const isCellInFillRange = (col) => {
    if (!selection) return false;

    return (
      selection.col === visibleColumns.indexOf(COLUMN_NAMES[col]) &&
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
          onFillStart?.({
            row: index,
            col: visibleColumns.indexOf(COLUMN_NAMES[col]),
          });
        }}
      />
    );
  };

  const renderColumnCell = (column) => {
    switch (column) {
      case "Date":
        return (
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
        );
      case "Client":
        return (
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
          contentClassName="w-[260px] p-0"
        />
        {renderFillHandle(1)}
      </TableCell>
        );
      case "Project":
        return (
<TableCell
        style={cellStyle(2)}
        className={[
          "sheet-cell",
          isCellActive(2) && "sheet-cell-active",
          isCellInFillRange(2) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <SearchableSelect
          open={openSelect === "project"}
          onOpenChange={(open) => setOpenSelect(open ? "project" : null)}
          value={item.project_id ? String(item.project_id) : NONE_VALUE}
          onValueChange={(v) => {
            const nextId = v === NONE_VALUE ? null : v;
            const selectedProject = projects.find((project) => String(project.id) === String(nextId));
            const patch = {
              project_id: nextId,
              client_id: selectedProject?.client_id || effectiveClientId || null,
            };
            if (nextId !== item.project_id) patch.deliverable_id = null;
            onUpdate(item.id, patch);
          }}
          options={[
            { value: NONE_VALUE, label: "—" },
            ...projectOptions.map((project) => ({ value: String(project.id), label: project.name })),
          ]}
          placeholder={effectiveClientId ? "Project" : "Select client first"}
          searchPlaceholder="Type project name..."
          emptyText="No projects found for this client"
          disabled={!canEditRow || !effectiveClientId}
          triggerProps={sheetCell(2)}
          data-testid={`worksheet-project-select-${item.id}`}
          contentClassName="w-[280px] p-0"
        />
        {renderFillHandle(2)}
      </TableCell>
        );
      case "Deliverable":
        return (
<TableCell
        style={cellStyle(3)}
        className={[
          "sheet-cell",
          isCellActive(3) && "sheet-cell-active",
          isCellInFillRange(3) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <SearchableSelect
          open={openSelect === "deliverable"}
          onOpenChange={(open) => setOpenSelect(open ? "deliverable" : null)}
          value={item.deliverable_id ? String(item.deliverable_id) : NONE_VALUE}
          onValueChange={(v) => onUpdate(item.id, { deliverable_id: v === NONE_VALUE ? null : v })}
          options={[
            { value: NONE_VALUE, label: "—" },
            ...projectDeliverables.map((deliverable) => ({ value: String(deliverable.id), label: deliverable.name })),
          ]}
          placeholder={item.project_id ? "Deliverable" : "Select project first"}
          searchPlaceholder="Type deliverable name..."
          emptyText="No deliverables found for this project"
          disabled={!canEditRow || !item.project_id}
          triggerProps={sheetCell(3)}
          data-testid={`worksheet-deliverable-select-${item.id}`}
          contentClassName="w-[300px] p-0"
        />
        {renderFillHandle(3)}
      </TableCell>
        );
      case "Stage":
        return (
<TableCell
        style={cellStyle(4)}
        className={[
          "sheet-cell",
          isCellActive(4) && "sheet-cell-active",
          isCellInFillRange(4) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <SearchableSelect
          open={openSelect === "stage"}
          onOpenChange={(open) => setOpenSelect(open ? "stage" : null)}
          value={item.stage || NONE_VALUE}
          onValueChange={(v) => onUpdate(item.id, { stage: v === NONE_VALUE ? null : v })}
          options={[
            { value: NONE_VALUE, label: "—" },
            ...STAGES.map((stage) => ({ value: stage, label: stage })),
          ]}
          placeholder="Stage"
          searchPlaceholder="Type stage..."
          emptyText="No stages found"
          disabled={!canEditRow}
          triggerProps={sheetCell(4)}
          data-testid={`worksheet-stage-select-${item.id}`}
          contentClassName="w-[180px] p-0"
        />
        {renderFillHandle(4)}
      </TableCell>
        );
      case "Deliverable Name":
        return (
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
        );
      case "Deliverable Link":
        return (
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
        );
      case "Type":
        return (
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
          <SearchableSelect
              open={openSelect === "type"}
              onOpenChange={(open) => setOpenSelect(open ? "type" : null)}
              value={item.deliverable_type || NONE_VALUE}
              onValueChange={(v) => {
                const nextType = v === NONE_VALUE ? "" : v;
                const category = options.deliverable_type_categories?.[nextType] || "";
                onUpdate(item.id, { deliverable_type: nextType, work_category: category });
              }}
              options={[
                { value: NONE_VALUE, label: "—" },
                ...(options.deliverable_types || []).map((type) => ({ value: type, label: type })),
              ]}
              placeholder="Type"
              searchPlaceholder="Type to search..."
              emptyText="No types found"
              disabled={!canEditExtra}
              triggerProps={sheetCell(7)}
              data-testid={`${WORKSHEET.typeSelect}-${item.id}`}
              contentClassName="w-[320px] p-0"
            />
        ) : (
          <span className="cell-plain block">{item.deliverable_type || "—"}</span>
        )}
        {renderFillHandle(7)}
      </TableCell>
        );
      case "Category":
        return (
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
          {...sheetCell(8)}
          data-testid={`${WORKSHEET.categorySelect}-${item.id}`}
          className="cell-plain block"
          tabIndex={canEditRow ? 0 : -1}
        >
          {item.work_category || "—"}
        </span>
        {renderFillHandle(8)}
      </TableCell>
        );
      case "Version":
        return (
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
        );
      case "Time (min)":
        return (
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
        );
      case "Creator":
        return (
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
          <SearchableSelect
              open={openSelect === "creator"}
              onOpenChange={(open) => setOpenSelect(open ? "creator" : null)}
              value={item.creator_id || NONE_VALUE}
              onValueChange={(v) => onUpdate(item.id, { creator_id: v === NONE_VALUE ? null : v })}
              options={[
                { value: NONE_VALUE, label: "Unassigned" },
                ...nonAdminUsers.map((user) => ({ value: user.id, label: user.name })),
              ]}
              placeholder="Creator"
              searchPlaceholder="Type creator name..."
              emptyText="No users found"
              disabled={!canEditExtra}
              triggerProps={sheetCell(11)}
              data-testid={`${WORKSHEET.creatorSelect}-${item.id}`}
              contentClassName="w-[240px] p-0"
            />
        ) : (
          <span className="cell-plain block">{nameOf(item.creator_id)}</span>
        )}
        {renderFillHandle(11)}
      </TableCell>
        );
      case "Reviewer":
        return (
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
          <SearchableSelect
              open={openSelect === "reviewer"}
              onOpenChange={(open) => setOpenSelect(open ? "reviewer" : null)}
              value={item.reviewer_id || NONE_VALUE}
              onValueChange={(v) => onUpdate(item.id, { reviewer_id: v === NONE_VALUE ? null : v })}
              options={[
                { value: NONE_VALUE, label: "Unassigned" },
                ...reviewerUsers.map((user) => ({ value: user.id, label: user.name })),
              ]}
              placeholder="Reviewer"
              searchPlaceholder="Type reviewer name..."
              emptyText="No reviewers found"
              disabled={!canEditRow}
              triggerProps={sheetCell(12)}
              data-testid={`${WORKSHEET.reviewerSelect}-${item.id}`}
              contentClassName="w-[240px] p-0"
            />
        ) : (
          <span className="cell-plain block">{item.reviewer_id ? nameOf(item.reviewer_id) : "Unassigned"}</span>
        )}
        {renderFillHandle(12)}
      </TableCell>
        );
      case "Remarks":
        return (
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
        );
      case "Status":
        return (
<TableCell
        style={cellStyle(14)}
        className={[
          "sheet-cell",
          isCellActive(14) && "sheet-cell-active",
          isCellInFillRange(14) && "sheet-cell-fill-range",
        ]
          .filter(Boolean)
          .join(" ")}>
        <SearchableSelect
          open={openSelect === "status"}
          onOpenChange={(open) => setOpenSelect(open ? "status" : null)}
          value={item.status || NONE_VALUE}
          onValueChange={(v) => onUpdate(item.id, { status: v })}
          options={(options.statuses || []).map((status) => ({
            value: status,
            label: status,
            disabled: !allowedStatuses?.includes(status),
          }))}
          placeholder="Status"
          searchPlaceholder="Type status..."
          emptyText="No statuses found"
          disabled={!canEditRow}
          triggerProps={sheetCell(14)}
          data-testid={`${WORKSHEET.statusSelect}-${item.id}`}
          className="border-none bg-transparent shadow-none p-0"
          contentClassName="w-[240px] p-0"
        />
        {renderFillHandle(14)}
      </TableCell>
        );
      default:
        return null;
    }
  };



  return (
    <TableRow
      data-testid={`worksheet-row-${item.id}`}
      className={`group ${isRowDragging ? "opacity-60" : ""}`}
      style={{
        display: "grid",
        gridTemplateColumns: `44px 44px ${visibleColumns
          .map((column) => COLUMN_WIDTHS[column] || "150px")
          .join(" ")} 52px`,
        minWidth: "max-content",
      }}
      onDragOver={(event) => onRowDragOver?.(event, item.id)}
      onDrop={(event) => onRowDrop?.(event, item.id)}
      onDragEnd={() => onRowDragEnd?.()}
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
      <TableCell className="row-num">
        <div className="flex items-center justify-center gap-0.5">
          <button
            type="button"
            draggable={canDragRow}
            onDragStart={(event) => {
              if (!canDragRow) return;
              event.stopPropagation();
              onRowDragStart?.(event, item.id);
            }}
            onClick={(event) => event.stopPropagation()}
            className={`inline-flex rounded p-1 text-slate-400 opacity-60 transition hover:bg-slate-200 hover:text-slate-700 hover:opacity-100 active:opacity-100 ${
              canDragRow
                ? "cursor-grab hover:bg-slate-200 hover:text-slate-600 active:cursor-grabbing"
                : "cursor-default opacity-40"
            }`}
            title="Drag row"
            aria-label="Drag row"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <span>{index}</span>
        </div>
      </TableCell>
      <TableCell className="checkbox-cell">
        <Checkbox
          data-testid={`worksheet-row-checkbox-${item.id}`}
          checked={selected}
          disabled={!canEditRow}
          onCheckedChange={() => onToggleSelect(item.id)}
        />
      </TableCell>
      {visibleColumns.map((column) => (
        <Fragment key={column}>
          {renderColumnCell(column)}
        </Fragment>
      ))}
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