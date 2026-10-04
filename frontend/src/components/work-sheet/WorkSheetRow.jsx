import { Fragment, memo, useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Info, Lock, Maximize2, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { TableCell, TableRow } from "../ui/table";
import { Input } from "../ui/input";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { Checkbox } from "../ui/checkbox";
import { SearchableSelect } from "./SearchableSelect";
import { ProjectPicker } from "./ProjectPicker";
import { RemarksEditor } from "./RemarksEditor";
import { StatusBadge } from "./StatusBadge";
import { WORKSHEET } from "@/constants/testIds";
import { canEditWorkItem, isRowLockedForMember } from "@/lib/worksheetPermissions";
import { createWorksheetKeyHandler, startEditingCell } from "./useWorksheetKeyboardNavigation";
import { buildGridTemplateColumns } from "@/constants/worksheetColumnWidths";
import {
  NOT_AVAILABLE_LABEL,
  NOT_AVAILABLE_VALUE,
  isDeliverableMissing,
} from "@/lib/deliverableRules";
import {
  MAX_WORK_DATE,
  MIN_WORK_DATE,
  isValidWorkDate,
} from "@/lib/worksheetDates";
import { isTimeMissing, lowTimeMessage, parseTimeInput, timeBadge } from "@/lib/timeRules";
import { avatarColorClasses } from "@/lib/avatarColors";

const NONE_VALUE = "__none__";
const STAGES = ["Content", "Design", "Animate"];

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
    clientNameOf = () => "",
    lookalikes,
    recentProjectsByCreator,
    onUpdate,
    onExpandUnits,
    selected,
    onToggleSelect,
    activeCell,
    onCellSelect,
    fillState,
    onFillStart,
    onFillHover,
    onFillEnd,
    selection,
    rangeSelection,
    totalRows = 0,
    onExtendSelection,
    onCheckboxRangeSelect,
    hiddenColumns = [],
    columnOrder = [],
    columnWidths = {},
    onRowDragStart,
    onRowDragOver,
    onRowDrop,
    onRowDragEnd,
    isRowDragging = false,
    dropIndicator = null,
    dragCount = 0,
    onCheckboxDragStart,
    onCheckboxDragEnter,
    onCheckboxClickCapture,
    rowObserver,
    canDragRow = true,
    hiddenRowIdsBefore = [],
    hiddenRowIdsAfter = [],
    onUnhideRows,
  } = props;
  const isMember = currentUser.role === "member";
  const isElevated = !isMember;
  const memberStage = {
    Content: "Content",
    Design: "Design",
    Animation: "Animate",
  }[currentUser.department];
  const canEditRow = isMember
    ? (!item.stage || item.stage === memberStage) &&
      !isRowLockedForMember(currentUser, item, users)
    : canEditWorkItem(currentUser, item, users);
  const lockedForMe = isMember && isRowLockedForMember(currentUser, item, users);
  const canEditExtra = isElevated && canEditRow;
  const [openSelect, setOpenSelect] = useState(null);
  const [remarksOpen, setRemarksOpen] = useState(false);
  const remarksRef = useRef(null);
  // Inline error under the Time box (e.g. a time far below the benchmark).
  const [timeError, setTimeError] = useState("");
  // Inline "how many slides / reels / pages?" editor shown under the row after
  // picking a type that is measured in units.
  const [unitOpen, setUnitOpen] = useState(false);
  const [unitCount, setUnitCount] = useState("10");
  const [unitBusy, setUnitBusy] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);
  const nameRef = useRef(null);
  const rowRef = useRef(null);

  // Rows grow with their wrapped text, so the table measures each mounted row
  // (it positions the rows it does not render from these heights).
  useEffect(() => {
    const el = rowRef.current;
    if (!el || !rowObserver) return undefined;
    rowObserver.observe(el);
    return () => rowObserver.unobserve(el);
  }, [rowObserver]);

  const openRemarks = () => setRemarksOpen(true);
  // Back on the Remarks cell afterwards, so the arrow keys carry on from it.
  const closeRemarks = () => {
    remarksRef.current?.closest("[data-sheet-cell]")?.focus();
    setRemarksOpen(false);
  };

  const openName = () => setNameOpen(true);
  const closeName = () => {
    nameRef.current?.closest("[data-sheet-cell]")?.focus();
    setNameOpen(false);
  };

  const [local, setLocal] = useState({
    work_date: item.work_date ?? "",
    deliverable_name: item.deliverable_name,
    deliverable_link: item.deliverable_link,
    version: item.version,
    time_taken_minutes: item.time_taken_minutes,
    remarks: item.remarks,
  });

  useEffect(() => {
    setLocal({
      work_date: item.work_date ?? "",
      deliverable_name: item.deliverable_name ?? "",
      deliverable_link: item.deliverable_link ?? "",
      version: item.version ?? "",
      time_taken_minutes: item.time_taken_minutes ?? 0,
      remarks: item.remarks ?? "",
    });
  }, [
    item.work_date,
    item.deliverable_name,
    item.deliverable_link,
    item.version,
    item.time_taken_minutes,
    item.remarks,
  ]);

  const nameOf = (id) => usersById[id]?.name || "Unassigned";

  const getInitials = (name) => {
    if (!name || name === "Unassigned") return "—";

    const parts = name.trim().split(/\s+/);

    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };
  const allowedStatuses = options.statuses;
  const project = item.project_id
    ? projects.find((p) => p.id === item.project_id)
    : undefined;
  const effectiveClientId = item.client_id || project?.client_id || undefined;
  // "Recently used" in the Project picker: projects the viewer, or this
  // row's creator, already has rows for.
  const isRecentProject = (projectId) =>
    !!(
      recentProjectsByCreator?.get(currentUser.id)?.has(projectId) ||
      recentProjectsByCreator?.get(item.creator_id)?.has(projectId)
    );
  const projectDeliverables = deliverablesByProject[item.project_id] || [];
  // Client work needs a deliverable (or "Not available"); highlight the cell
  // until one is chosen.
  const deliverableMissing = isDeliverableMissing(
    item,
    options.deliverable_type_categories
  );
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
    7: "Deliverable Type",
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
        deliverable_not_available: false,
      });
      localStorage.removeItem("ws_last_client_id");
      localStorage.removeItem("ws_last_project_id");
      localStorage.removeItem("ws_last_deliverable_id");
      return;
    }

    if (field === "project_id") {
      onUpdate(item.id, {
        project_id: null,
        deliverable_id: null,
        deliverable_not_available: false,
      });
      localStorage.removeItem("ws_last_project_id");
      localStorage.removeItem("ws_last_deliverable_id");
      return;
    }

    if (field === "deliverable_id") {
      // Clearing the cell also clears a "Not available" choice.
      onUpdate(item.id, { deliverable_id: null, deliverable_not_available: false });
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

  const navigationColFor = (col) => {
    const visualCol = visibleColumns.indexOf(COLUMN_NAMES[col]);
    return visualCol === -1 ? col : visualCol;
  };

  // Props for a cell's control (input, dropdown button). The table cell
  // around it (cellProps below) is what keyboard navigation targets.
  const sheetCell = (col) => {
    const navigationCol = navigationColFor(col);

    return {
      onMouseDown: () => onCellSelect?.({ row: index, col: navigationCol }),
      onFocus: () => onCellSelect?.({ row: index, col: navigationCol }),
      onKeyDown: (event) => {
        const target = event.target;

        // Mac's "delete" key sends "Backspace", not "Delete" — see the
        // same note in WorkSheetPage.jsx's row-delete shortcut. Forward
        // Delete always clears the cell. Backspace only clears it when
        // the target isn't an actual text-editing input/textarea (e.g. a
        // dropdown trigger button) — otherwise Backspace has to keep
        // deleting one character at a time while typing, same as normal.
        const isTextEditable =
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement;
        // In a date field Delete/Backspace clear the focused day/month/year
        // segment (native behaviour). Treating Delete as "clear the whole
        // cell" saved a blank date, which breaks sorting and month reports.
        const isDateInput =
          target instanceof HTMLInputElement && target.type === "date";
        const isClearKey =
          !isDateInput &&
          (event.key === "Delete" ||
            (event.key === "Backspace" && !isTextEditable));

        if (isClearKey && !event.defaultPrevented) {
          event.preventDefault();
          event.stopPropagation();
          clearCell(col);
          return;
        }

        return createWorksheetKeyHandler({
          row: index,
          col: navigationCol,
          maxCol: Math.max(0, visibleColumns.length - 1),
          maxRow: totalRows,
          onExtendSelection,
        })(event);
      },
    };
  };

  // Props for the table cell itself. Every visible cell is focusable
  // (tabIndex -1) and carries the grid coordinates, so arrow keys and Tab
  // can land on it even when there is nothing to edit there: a row this
  // person can't edit, or a read-only column such as Creator. Its key and
  // focus handlers only act when the cell itself has focus; events from the
  // control inside are already handled by sheetCell above.
  //
  // `navShell` cells (Date) keep keyboard focus on the cell rather than the
  // input: a date input uses Left/Right for its day/month/year parts, so
  // arrowing through the sheet would get stuck inside it. Enter (or a click)
  // goes into the input to edit.
  //
  // `onExpand` (Remarks) opens the cell's full editor on Ctrl/⌘+Enter.
  const cellProps = (col, extraClassName, { navShell = false, onExpand } = {}) => {
    const navigationCol = navigationColFor(col);
    const control = sheetCell(col);

    return {
      ...(navShell ? { "data-nav-shell": true } : {}),
      style: cellStyle(col),
      className: [
        "sheet-cell",
        isCellActive(col) && "sheet-cell-active",
        isCellInFillRange(col) && "sheet-cell-fill-range",
        isCellInRangeSelection(col) && "sheet-cell-range-select",
        extraClassName,
      ]
        .filter(Boolean)
        .join(" "),
      "data-sheet-cell": true,
      "data-sheet-row": index,
      "data-sheet-col": navigationCol,
      tabIndex: -1,
      onMouseDown: control.onMouseDown,
      onFocus: (event) => {
        if (event.target === event.currentTarget) control.onFocus();
      },
      onKeyDown: (event) => {
        if (event.target !== event.currentTarget) return;
        if (onExpand && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onExpand();
          return;
        }
        // Enter (or F2) on a cell you have arrowed to starts editing it: a
        // text box gets the caret, a dropdown opens. Moving around never
        // edits; nothing happens on a cell you cannot edit.
        if (
          (event.key === "Enter" &&
            !event.shiftKey &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey) ||
          event.key === "F2"
        ) {
          event.preventDefault();
          if (canEditRow) startEditingCell(event.currentTarget);
          return;
        }
        control.onKeyDown(event);
      },
    };
  };

  const commit = (field, value) => {
    if (item[field] === value) return;
    onUpdate(item.id, { [field]: value });
  };

  // Save the date when the user leaves the field, like every other cell,
  // and only if it is a complete, real date. While a native date input is
  // being typed into it reports "" or a partial year such as 0006; saving
  // those (as it used to on every keystroke) wrote bad dates and made the
  // field reset itself under the user's fingers. Anything incomplete just
  // snaps back to the last saved date.
  const commitWorkDate = () => {
    if (!isValidWorkDate(local.work_date)) {
      setLocal((current) => ({ ...current, work_date: item.work_date ?? "" }));
      return;
    }
    commit("work_date", local.work_date);
  };

  // Same idea for time: check it when the user leaves the box. A bad value
  // (negative, text, more than 24 h) snaps back to the last saved time with a
  // reason; a blank box is sent as 0, which the server turns back into the
  // person's benchmark for this deliverable type when there is one.
  const commitTime = () => {
    const parsed = parseTimeInput(local.time_taken_minutes);

    if (!parsed.ok) {
      toast.error(parsed.message);
      setLocal((current) => ({
        ...current,
        time_taken_minutes: item.time_taken_minutes ?? 0,
      }));
      return;
    }

    // A time far below this type's benchmark is not saved: say why, right
    // here, and leave what was typed so it can be corrected. Only when the
    // value is being changed - an old low value is left alone.
    if (parsed.minutes !== Number(item.time_taken_minutes || 0)) {
      const message = lowTimeMessage(
        parsed.minutes,
        item.time_benchmark_minutes,
        item.deliverable_type
      );
      if (message) {
        setTimeError(message);
        setLocal((current) => ({ ...current, time_taken_minutes: parsed.minutes }));
        return;
      }
    }

    setTimeError("");
    setLocal((current) => ({ ...current, time_taken_minutes: parsed.minutes }));
    commit("time_taken_minutes", parsed.minutes);
  };

  const timeMissing = isTimeMissing(item);
  const timeHint = timeBadge(item);

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

  // Google-Sheets-style rectangular selection made with Shift+Arrow /
  // Shift+Ctrl+Arrow. Separate from `selection` above, which is a
  // single-column range used only for the fill-handle drag — keeping
  // them apart avoids the keyboard range accidentally triggering a
  // fill-copy, and vice versa.
  const isCellInRangeSelection = (col) => {
    if (!rangeSelection) return false;

    const visualCol = visibleColumns.indexOf(COLUMN_NAMES[col]);
    const { anchorRow, anchorCol, row, col: endCol } = rangeSelection;

    return (
      visualCol >= Math.min(anchorCol, endCol) &&
      visualCol <= Math.max(anchorCol, endCol) &&
      index >= Math.min(anchorRow, row) &&
      index <= Math.max(anchorRow, row)
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
<TableCell {...cellProps(0, null, { navShell: true })}>
        <Input
          {...sheetCell(0)}
          data-testid={`${WORKSHEET.dateInput}-${item.id}`}
          type="date"
          value={local.work_date}
          min={MIN_WORK_DATE}
          max={MAX_WORK_DATE}
          disabled={!canEditRow}
          onChange={(e) => setLocal((l) => ({ ...l, work_date: e.target.value }))}
          onBlur={commitWorkDate}
          className="sheet-date-input h-8 w-[130px] pl-7 pr-1"
        />

        {renderFillHandle(0)}
      </TableCell>
        );
      case "Client":
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
      case "Project":
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
              patch.deliverable_id = deliverable.id;
              patch.deliverable_not_available = false;
            } else if (picked.id !== item.project_id) {
              patch.deliverable_id = null;
              patch.deliverable_not_available = false;
            }
            onUpdate(item.id, patch);

            const twins = lookalikes?.get(picked.id) || [];
            if (twins.length) {
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
      case "Deliverable":
        return (
<TableCell {...cellProps(3, deliverableMissing && "shadow-[inset_2px_0_0_#fb7185]")}>
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
            onUpdate(item.id, {
              deliverable_id: v === NONE_VALUE ? null : v,
              deliverable_not_available: false,
            });
          }}
          options={[
            { value: NONE_VALUE, label: "—" },
            ...projectDeliverables.map((deliverable) => ({ value: String(deliverable.id), label: deliverable.name })),
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
        />
        {renderFillHandle(3)}
      </TableCell>
        );
      case "Stage":
        return (
<TableCell {...cellProps(4)}>
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
          contentClassName="w-[200px] p-0"
        />
        {renderFillHandle(4)}
      </TableCell>
        );
      case "Deliverable Name":
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
      case "Deliverable Link":
        return (
<TableCell {...cellProps(6)}>
        {canEditRow ? (
          <AutoGrowTextarea
            {...sheetCell(6)}
            data-testid={`${WORKSHEET.deliverableLinkInput}-${item.id}`}
            value={local.deliverable_link}
            onChange={(e) =>
              setLocal((l) => ({ ...l, deliverable_link: e.target.value.replace(/[\r\n]+/g, "") }))
            }
            onBlur={() => commit("deliverable_link", local.deliverable_link)}
            className="break-all"
            placeholder="Paste drive link"
          />
        ) : item.deliverable_link ? (
          <a href={item.deliverable_link} target="_blank" rel="noreferrer" className="cell-plain block break-all text-indigo-600 underline">
            {item.deliverable_link}
          </a>
        ) : (
          <span className="cell-plain block">—</span>
        )}
        {renderFillHandle(6)}
      </TableCell>
        );
      case "Deliverable Type":
        return (
<TableCell {...cellProps(7)}>
        {canEditRow ? (
          <SearchableSelect
              open={openSelect === "type"}
              onOpenChange={(open) => setOpenSelect(open ? "type" : null)}
              value={item.deliverable_type || NONE_VALUE}
              onValueChange={(v) => {
                const nextType = v === NONE_VALUE ? "" : v;
                const category = options.deliverable_type_categories?.[nextType] || "";
                onUpdate(item.id, { deliverable_type: nextType, work_category: category });
                // A type measured in units opens the inline quantity editor;
                // any other type closes it. Nothing is created until "Add".
                setUnitOpen(Boolean(nextType && options.deliverable_type_units?.[nextType]));
              }}
              options={[
                { value: NONE_VALUE, label: "—" },
                ...(options.deliverable_types || []).map((type) => ({ value: type, label: type })),
              ]}
              placeholder="Deliverable Type"
              searchPlaceholder="Type to search..."
              emptyText="No types found"
              disabled={!canEditRow}
              triggerProps={sheetCell(7)}
              data-testid={`${WORKSHEET.typeSelect}-${item.id}`}
              contentClassName="w-[440px] p-0"
            />
        ) : (
          <span className="cell-plain block">{item.deliverable_type || "—"}</span>
        )}
        {renderFillHandle(7)}
      </TableCell>
        );
      case "Category":
        return (
<TableCell {...cellProps(8)}>
        <span
          data-testid={`${WORKSHEET.categorySelect}-${item.id}`}
          className="cell-plain block"
        >
          {item.work_category || "—"}
        </span>
        {renderFillHandle(8)}
      </TableCell>
        );
      case "Version":
        return (
<TableCell {...cellProps(9)}>
        <Input
          {...sheetCell(9)}
          data-testid={`${WORKSHEET.versionInput}-${item.id}`}
          value={local.version}
          disabled={!canEditRow}
          onChange={(e) => setLocal((l) => ({ ...l, version: e.target.value }))}
          onBlur={() => commit("version", local.version)}
          className="h-7 w-[80px]"
          placeholder="v1"
        />
        {renderFillHandle(9)}
      </TableCell>
        );
      case "Time (min)":
        return (
<TableCell {...cellProps(10)}>
        <div className="flex items-center gap-1">
          <Input
            {...sheetCell(10)}
            data-testid={`${WORKSHEET.timeInput}-${item.id}`}
            // Text, not type="number": a number box hides where the cursor
            // is, so Left/Right could never move on to the next cell from
            // here. commitTime still checks the value (0-1440 minutes).
            type="text"
            inputMode="decimal"
            required
            aria-required="true"
            aria-invalid={timeMissing}
            placeholder={timeHint?.benchmark ? String(timeHint.benchmark) : "min"}
            title={
              timeMissing
                ? "Time is required. It is filled automatically when your benchmark exists for this deliverable type - otherwise enter the minutes."
                : undefined
            }
            value={local.time_taken_minutes}
            disabled={!canEditRow}
            onChange={(e) => {
              setTimeError("");
              setLocal((l) => ({ ...l, time_taken_minutes: e.target.value }));
            }}
            onBlur={commitTime}
            aria-invalid={timeMissing || Boolean(timeError)}
            className={`h-7 w-[64px] px-2 ${
              timeMissing || timeError
                ? "border-rose-400 bg-rose-50/70 ring-1 ring-rose-200 focus-visible:ring-rose-300"
                : ""
            }`}
          />

          {timeHint?.kind === "auto" && (
            <span
              data-testid={`worksheet-time-auto-${item.id}`}
              title={`Auto-filled from your benchmark for ${item.deliverable_type}: ${timeHint.benchmark} min. You can edit it if this one was different.`}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-indigo-500"
            >
              <Sparkles className="h-3.5 w-3.5" />
            </span>
          )}

          {timeHint?.kind === "edited" && canEditRow && (
            <button
              type="button"
              data-testid={`worksheet-time-reset-${item.id}`}
              title={`Edited. Your benchmark for ${item.deliverable_type} is ${timeHint.benchmark} min - click to use it.`}
              onClick={() => onUpdate(item.id, { time_taken_minutes: timeHint.benchmark })}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-amber-600 transition-colors hover:bg-amber-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {timeError && (
          <p
            role="alert"
            data-testid={`worksheet-time-error-${item.id}`}
            className="mt-1 text-[11px] leading-4 text-rose-600"
          >
            {timeError}
          </p>
        )}
        {renderFillHandle(10)}
      </TableCell>
        );
      case "Creator":
        return (
<TableCell {...cellProps(11)}>
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
              contentClassName="w-[280px] p-0"
              renderValue={(option) => {
                const name = option?.label || "Unassigned";
                const initials = getInitials(name);

                return (
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColorClasses(option?.value)}`}
                    >
                      {initials}
                    </span>
                    <span className="min-w-0 break-words text-[13px] leading-5 text-slate-700">{name}</span>
                  </span>
                );
              }}
            />
        ) : (
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColorClasses(item.creator_id)}`}
            >
              {getInitials(nameOf(item.creator_id))}
            </span>
            <span className="cell-plain min-w-0">{nameOf(item.creator_id)}</span>
            {lockedForMe && (
              <Lock
                className="h-3 w-3 shrink-0 text-muted-foreground"
                aria-label="Locked"
                title={`This row was created by ${nameOf(item.creator_id)}. Only they (or a manager) can edit it.`}
              />
            )}
          </span>
        )}
        {renderFillHandle(11)}
      </TableCell>
        );
      case "Reviewer":
        return (
<TableCell {...cellProps(12)}>
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
              contentClassName="w-[280px] p-0"
            />
        ) : (
          <span className="cell-plain block">{item.reviewer_id ? nameOf(item.reviewer_id) : "Unassigned"}</span>
        )}
        {renderFillHandle(12)}
      </TableCell>
        );
      case "Remarks":
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
      case "Status":
        return (
<TableCell {...cellProps(14)}>
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
          renderValue={(_option, value) =>
            value && value !== NONE_VALUE ? (
              <StatusBadge status={value} />
            ) : (
              "Status"
            )
          }
          placeholder="Status"
          searchPlaceholder="Type status..."
          emptyText="No statuses found"
          disabled={!canEditRow}
          triggerProps={sheetCell(14)}
          data-testid={`${WORKSHEET.statusSelect}-${item.id}`}
          className="border-none bg-transparent shadow-none p-0"
          contentClassName="w-[280px] p-0"
        />
        {renderFillHandle(14)}
      </TableCell>
        );
      default:
        return null;
    }
  };



  // The editor follows the row's CURRENT type, so changing PPT -> Carousel
  // updates its wording and picking a type without units makes it disappear.
  const unitLabel = options.deliverable_type_units?.[item.deliverable_type];
  const unitLower = unitLabel ? unitLabel.toLowerCase() : "";
  const showUnitEditor = unitOpen && Boolean(unitLabel) && canEditRow;
  const unitText = String(unitCount).trim();
  const unitNumber = Number(unitText);
  const unitError =
    unitText === ""
      ? "Enter how many"
      : !/^\d+$/.test(unitText)
        ? "Use a whole number"
        : unitNumber < 1
          ? "Must be at least 1"
          : unitNumber > 100
            ? "100 at most at a time"
            : "";

  const submitUnits = async () => {
    if (unitError || unitBusy || !onExpandUnits) return;
    setUnitBusy(true);
    const ok = await onExpandUnits(item, unitNumber, unitLabel);
    setUnitBusy(false);
    // On failure the editor stays open with the number as typed.
    if (ok) setUnitOpen(false);
  };

  return (
    <TableRow
      ref={rowRef}
      data-testid={`worksheet-row-${item.id}`}
      data-row-id={item.id}
      className={`group relative ${isRowDragging ? "opacity-60" : ""} ${
        selected ? "sheet-row-selected" : ""
      } ${
        dropIndicator
          ? `after:pointer-events-none after:absolute after:inset-x-0 after:z-40 after:h-0.5 after:bg-[#2b2bb5] after:content-[''] ${
              dropIndicator === "before" ? "after:top-0" : "after:bottom-0"
            }`
          : ""
      }`}
      style={{
        display: "grid",
        gridTemplateColumns: buildGridTemplateColumns(
          visibleColumns,
          columnWidths
        ),
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
      <TableCell className="row-num relative">
        {hiddenRowIdsBefore.length > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onUnhideRows?.(hiddenRowIdsBefore);
            }}
            className="absolute -right-2 top-1/2 z-30 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-blue-50 hover:text-blue-600"
            title={`Show ${hiddenRowIdsBefore.length} hidden row${
              hiddenRowIdsBefore.length === 1 ? "" : "s"
            }`}
            aria-label="Show hidden rows"
          >
            <ChevronsUpDown className="h-3 w-3" />
          </button>
        )}

        {hiddenRowIdsAfter.length > 0 && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onUnhideRows?.(hiddenRowIdsAfter);
            }}
            className="absolute -right-2 top-1/2 z-30 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-blue-50 hover:text-blue-600"
            title={`Show ${hiddenRowIdsAfter.length} hidden row${
              hiddenRowIdsAfter.length === 1 ? "" : "s"
            }`}
            aria-label="Show hidden rows"
          >
            <ChevronsUpDown className="h-3 w-3" />
          </button>
        )}

        {/* Six-dot grip, like a spreadsheet's row handle. Drag it to move the
            row (or every selected row, when this row is one of them). */}
        <button
          type="button"
          draggable={canDragRow}
          onDragStart={(event) => {
            if (!canDragRow) return;
            event.stopPropagation();
            onRowDragStart?.(event, item.id);
          }}
          onClick={(event) => event.stopPropagation()}
          className={`grid h-6 w-4 grid-cols-[repeat(2,3px)] auto-rows-[3px] content-center justify-center gap-[2px] rounded text-slate-300 transition-colors ${
            canDragRow
              ? "cursor-grab hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
              : "cursor-default opacity-50"
          }`}
          title={
            dragCount > 1
              ? `Drag ${dragCount} selected rows (row ${index})`
              : `Drag to move row ${index}`
          }
          aria-label={dragCount > 1 ? `Drag ${dragCount} selected rows` : `Drag row ${index}`}
        >
          {[0, 1, 2, 3, 4, 5].map((dot) => (
            <span key={dot} className="rounded-full bg-current" />
          ))}
        </button>
      </TableCell>
      <TableCell
        className="checkbox-cell pl-1 pt-[10px]"
        // Press on one checkbox and drag over the others to select (or, if
        // that row was already selected, deselect) every row in between.
        onMouseDown={(event) => onCheckboxDragStart?.(event, item.id, index)}
        onMouseEnter={() => onCheckboxDragEnter?.(index)}
        onClickCapture={onCheckboxClickCapture}
      >
        <Checkbox
          data-testid={`worksheet-row-checkbox-${item.id}`}
          data-checkbox-row={index}
          className="rounded-[5px] border-slate-300 shadow-none"
          checked={selected}
          disabled={!canEditRow}
          onCheckedChange={() => onToggleSelect(item.id)}
          onKeyDown={(event) => {
            // Click one checkbox, then Shift+Down/Up to bulk-select the
            // rows in between — same as Google Sheets' row-header
            // behavior. The anchor is whichever row was last plainly
            // clicked/toggled; this only extends from it.
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            if (!event.shiftKey) return;
            event.preventDefault();
            onCheckboxRangeSelect?.(
              index,
              event.key === "ArrowDown" ? "down" : "up"
            );
          }}
        />
      </TableCell>

      {visibleColumns.map((column) => (
        <Fragment key={column}>
          {renderColumnCell(column)}
        </Fragment>
      ))}

      {showUnitEditor && (
        <td
          data-testid={`worksheet-unit-editor-${item.id}`}
          style={{ gridColumn: "1 / -1" }}
          className="border-b border-t border-[#dcdcf8] bg-[#f4f6ff] p-0"
          onKeyDown={(event) => {
            // Nothing typed here should reach the sheet's own shortcuts.
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              setUnitOpen(false);
            }
          }}
        >
          <div className="sticky left-0 flex w-[calc(100vw-320px)] min-w-[640px] max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
            <div className="min-w-[220px]">
              <p className="text-sm font-semibold leading-5 text-foreground">{item.deliverable_type}</p>
              <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                How many {unitLower}s do you want to add?
              </p>
            </div>

            <label className="flex w-[168px] shrink-0 flex-col gap-1.5">
              <span className="text-xs font-medium leading-4 text-foreground">Number of {unitLower}s</span>
              <input
                type="number"
                min={1}
                max={100}
                step={1}
                inputMode="numeric"
                value={unitCount}
                autoFocus
                aria-invalid={Boolean(unitError)}
                data-testid={`worksheet-unit-count-${item.id}`}
                onChange={(event) => setUnitCount(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submitUnits();
                  }
                }}
                className={`h-10 rounded-lg border bg-white px-3 text-sm outline-none focus:ring-[3px] ${
                  unitError
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200"
                    : "border-input focus:border-[#2b2bb5] focus:ring-[#2b2bb5]/20"
                }`}
              />
              {unitError && (
                <span role="alert" className="text-[11px] leading-4 text-rose-600">
                  {unitError}
                </span>
              )}
            </label>

            <div className="flex min-w-[300px] flex-1 items-center gap-3 rounded-lg border border-[#dcdcf8] bg-[#eef0ff] px-4 py-3">
              <Info className="h-4 w-4 shrink-0 text-[#2b2bb5]" />
              <div className="text-xs leading-5 text-[#1a1a8a]">
                <p className="font-semibold">
                  {unitError ? "Enter a number to continue" : `This will create ${unitNumber} row${unitNumber === 1 ? "" : "s"}`}
                </p>
                <p className="text-[#1a1a8a]/80">
                  1 row per {unitLower}, named {item.deliverable_type.replace(/\s+-\s+Per\s+\w+$/, "")} - {unitLabel} 1, {unitLabel} 2…
                </p>
              </div>
            </div>

            <div className="ml-auto flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setUnitOpen(false)}
                disabled={unitBusy}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-4 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Cancel
              </button>
              <button
                type="button"
                onClick={submitUnits}
                disabled={Boolean(unitError) || unitBusy}
                data-testid={`worksheet-unit-add-${item.id}`}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2b2bb5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#1a1a8a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                {unitBusy
                  ? "Adding…"
                  : unitError
                    ? "Add rows"
                    : `Add ${unitNumber} row${unitNumber === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </td>
      )}
    </TableRow>
  );
});