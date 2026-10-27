import { Fragment, memo, useEffect, useMemo, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { TableCell, TableRow } from "../ui/table";
import { Checkbox } from "../ui/checkbox";
import { canEditWorkItem, isRowLockedForMember } from "@/lib/worksheetPermissions";
import { createWorksheetKeyHandler, startEditingCell } from "./useWorksheetKeyboardNavigation";
import { buildGridTemplateColumns } from "@/constants/worksheetColumnWidths";
import { frozenStyle } from "@/lib/worksheetFreeze";
import { isDeliverableMissing } from "@/lib/deliverableRules";
import { isValidWorkDate } from "@/lib/worksheetDates";
import { isTimeMissing, lowTimeMessage, parseTimeInput, timeBadge } from "@/lib/timeRules";
import { durationPatch, durationSecondsOf, formatDurationSeconds, deliverableIdsOf, isMultiDeliverableRow, isQtySet } from "@/lib/quantity";

const NONE_VALUE = "__none__";
const STAGES = ["Content", "Design", "Animate"];
// A person can only work on rows of their own department's stage, so that is
// who can be tagged on an entry of a given stage.
const STAGE_BY_DEPARTMENT = {
  Content: "Content",
  Design: "Design",
  Animation: "Animate",
};

// The two glyphs of the Qty cell, drawn from the redesign's icon set
// (fi-rr-list and fi-rr-plus-small) so they match it exactly.
const QtyListIcon = ({ className }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M 1 2 L 17 2 C 17.265 2 17.52 1.895 17.707 1.707 C 17.895 1.52 18 1.265 18 1 C 18 0.735 17.895 0.48 17.707 0.293 C 17.52 0.105 17.265 0 17 0 L 1 0 C 0.735 0 0.48 0.105 0.293 0.293 C 0.105 0.48 0 0.735 0 1 C 0 1.265 0.105 1.52 0.293 1.707 C 0.48 1.895 0.735 2 1 2 Z" transform="translate(6 4.000)" fill="currentColor" fillRule="evenodd" />
    <path d="M 17 0 L 1 0 C 0.735 0 0.48 0.105 0.293 0.293 C 0.105 0.48 0 0.735 0 1 C 0 1.265 0.105 1.52 0.293 1.707 C 0.48 1.895 0.735 2 1 2 L 17 2 C 17.265 2 17.52 1.895 17.707 1.707 C 17.895 1.52 18 1.265 18 1 C 18 0.735 17.895 0.48 17.707 0.293 C 17.52 0.105 17.265 0 17 0 Z" transform="translate(6 11.000)" fill="currentColor" fillRule="evenodd" />
    <path d="M 17 0 L 1 0 C 0.735 0 0.48 0.105 0.293 0.293 C 0.105 0.48 0 0.735 0 1 C 0 1.265 0.105 1.52 0.293 1.707 C 0.48 1.895 0.735 2 1 2 L 17 2 C 17.265 2 17.52 1.895 17.707 1.707 C 17.895 1.52 18 1.265 18 1 C 18 0.735 17.895 0.48 17.707 0.293 C 17.52 0.105 17.265 0 17 0 Z" transform="translate(6 18)" fill="currentColor" fillRule="evenodd" />
  </svg>
);

const QtyPlusIcon = ({ className }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path d="M 11 5 L 7 5 L 7 1 C 7 0.735 6.895 0.48 6.707 0.293 C 6.52 0.105 6.265 0 6 0 C 5.735 0 5.48 0.105 5.293 0.293 C 5.105 0.48 5 0.735 5 1 L 5 5 L 1 5 C 0.735 5 0.48 5.105 0.293 5.293 C 0.105 5.48 0 5.735 0 6 C 0 6.265 0.105 6.52 0.293 6.707 C 0.48 6.895 0.735 7 1 7 L 5 7 L 5 11 C 5 11.265 5.105 11.52 5.293 11.707 C 5.48 11.895 5.735 12 6 12 C 6.265 12 6.52 11.895 6.707 11.707 C 6.895 11.52 7 11.265 7 11 L 7 7 L 11 7 C 11.265 7 11.52 6.895 11.707 6.707 C 11.895 6.52 12 6.265 12 6 C 12 5.735 11.895 5.48 11.707 5.293 C 11.52 5.105 11.265 5 11 5 Z" transform="translate(6 6)" fill="currentColor" fillRule="evenodd" />
  </svg>
);

import { renderDateCell } from "./cells/DateCell";
import { renderClientCell } from "./cells/ClientCell";
import { renderProjectCell } from "./cells/ProjectCell";
import { renderDeliverableCell } from "./cells/DeliverableCell";
import { renderStageCell } from "./cells/StageCell";
import { renderDeliverableNameCell } from "./cells/DeliverableNameCell";
import { renderDeliverableLinkCell } from "./cells/DeliverableLinkCell";
import { renderDeliverableTypeCell } from "./cells/DeliverableTypeCell";
import { renderQtyCell } from "./cells/QtyCell";
import { renderDurationCell } from "./cells/DurationCell";
import { renderCategoryCell } from "./cells/CategoryCell";
import { renderVersionCell } from "./cells/VersionCell";
import { renderTimeMinCell } from "./cells/TimeMinCell";
import { renderCreatorCell } from "./cells/CreatorCell";
import { renderReviewerCell } from "./cells/ReviewerCell";
import { renderRemarksCell } from "./cells/RemarksCell";
import { renderStatusCell } from "./cells/StatusCell";

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
    // Collaborators: `collabCount` is how many OTHER people share this entry
    // (a number, so the memoized row only re-renders when it changes);
    // getCollabMemberIds(groupId) reads the live list when the picker opens.
    collabCount = 0,
    getCollabMemberIds,
    onAddCollaborators,
    onOpenQty,
    qtyPanelOpen = false,
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
    frozenLefts,
    wrappedColumns = [],
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
  // What is typed into the Qty / Duration boxes before it is saved.
  const [qtyText, setQtyText] = useState("");
  const [durationText, setDurationText] = useState(
    formatDurationSeconds(durationSecondsOf(item))
  );
  // Inline error under the Duration box.
  const [durationError, setDurationError] = useState("");
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
    setDurationText(formatDurationSeconds(durationSecondsOf(item)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.video_duration_seconds, item.video_duration_minutes]);

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

  // Collaborators: who can be tagged on this entry, and whether this person
  // may tag. The server enforces the same rules (and refuses duplicates).
  const collabCandidates = useMemo(
    () =>
      nonAdminUsers
        .filter(
          (u) =>
            u.id !== item.creator_id &&
            u.active !== false &&
            (!item.stage || STAGE_BY_DEPARTMENT[u.department] === item.stage)
        )
        .map((u) => ({ id: u.id, name: u.name, department: u.department })),
    [nonAdminUsers, item.stage, item.creator_id]
  );
  const collabRowReady = Boolean(
    item.work_date &&
      (item.project_id ||
        item.deliverable_id ||
        (item.deliverable_name || "").trim() ||
        item.deliverable_type)
  );
  const canTagCollaborators =
    Boolean(onAddCollaborators) && canEditRow && currentUser.role !== "admin";

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
    15: "Qty",
    16: "Duration",
  };

  const orderedColumns = columnOrder.length
    ? columnOrder
    : Object.values(COLUMN_NAMES);
  const visibleColumns = orderedColumns.filter(
    (column) => !isColumnHidden(column)
  );

  const cellStyle = (col) => ({
    display: isColumnHidden(COLUMN_NAMES[col]) ? "none" : undefined,
    ...frozenStyle(frozenLefts, COLUMN_NAMES[col]),
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

  // A Campaign Ideation Plan row covers several of its project's deliverables,
  // ticked in the Deliverable cell. They belong to the project, so whatever
  // changes or empties the project must empty the list too.
  const multiDeliverable = isMultiDeliverableRow(item);
  const noDeliverables = () =>
    multiDeliverable ? { deliverable_ids: [], quantity: 1, quantity_items: [] } : {};

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
      15: "quantity",
      16: "video_duration_minutes",
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
        ...noDeliverables(),
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
        ...noDeliverables(),
      });
      localStorage.removeItem("ws_last_project_id");
      localStorage.removeItem("ws_last_deliverable_id");
      return;
    }

    if (field === "deliverable_id") {
      // Clearing the cell also clears a "Not available" choice (and, on a
      // Campaign Ideation Plan row, every ticked deliverable).
      onUpdate(item.id, {
        deliverable_id: null,
        deliverable_not_available: false,
        ...noDeliverables(),
      });
      return;
    }

    if (field === "quantity") {
      if (multiDeliverable) {
        // The count is the ticked deliverables; only the time for each can be cleared.
        if ((item.quantity_items || []).some(Boolean)) {
          onUpdate(item.id, { quantity_items: deliverableIdsOf(item).map(() => null) });
        }
        return;
      }
      // Back to the default of one unit, with no per-unit breakdown.
      if (isQtySet(item)) onUpdate(item.id, { quantity: 1, quantity_items: [] });
      return;
    }

    if (field === "video_duration_minutes") {
      if (durationSecondsOf(item) != null) {
        onUpdate(item.id, durationPatch(null));
      }
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
        wrappedColumns.includes(COLUMN_NAMES[col]) && "sheet-cell-wrap",
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
    const cellCtx = {
      NONE_VALUE,
      QtyListIcon,
      QtyPlusIcon,
      STAGES,
      allowedStatuses,
      canEditExtra,
      canEditRow,
      canTagCollaborators,
      cellProps,
      clientName,
      clientNameOf,
      clients,
      closeName,
      closeRemarks,
      collabCandidates,
      collabCount,
      collabRowReady,
      commit,
      commitTime,
      commitWorkDate,
      deliverableMissing,
      deliverableName,
      deliverablesByProject,
      durationError,
      durationText,
      effectiveClientId,
      getCollabMemberIds,
      getInitials,
      isCellActive,
      isRecentProject,
      item,
      local,
      lockedForMe,
      lookalikes,
      multiDeliverable,
      nameOf,
      nameOpen,
      nameRef,
      noDeliverables,
      nonAdminUsers,
      onAddCollaborators,
      onOpenQty,
      onUpdate,
      openName,
      openRemarks,
      openSelect,
      options,
      projectDeliverables,
      projectName,
      projects,
      qtyPanelOpen,
      qtyText,
      remarksOpen,
      remarksRef,
      renderFillHandle,
      reviewerUsers,
      setDurationError,
      setDurationText,
      setLocal,
      setOpenSelect,
      setQtyText,
      setTimeError,
      sheetCell,
      timeError,
      timeHint,
      timeMissing,
    };
    switch (column) {
      case "Date":
        return renderDateCell(cellCtx);
      case "Client":
        return renderClientCell(cellCtx);
      case "Project":
        return renderProjectCell(cellCtx);
      case "Deliverable":
        return renderDeliverableCell(cellCtx);
      case "Stage":
        return renderStageCell(cellCtx);
      case "Deliverable Name":
        return renderDeliverableNameCell(cellCtx);
      case "Deliverable Link":
        return renderDeliverableLinkCell(cellCtx);
      case "Deliverable Type":
        return renderDeliverableTypeCell(cellCtx);
      case "Qty":
        return renderQtyCell(cellCtx);
      case "Duration":
        return renderDurationCell(cellCtx);
      case "Category":
        return renderCategoryCell(cellCtx);
      case "Version":
        return renderVersionCell(cellCtx);
      case "Time (min)":
        return renderTimeMinCell(cellCtx);
      case "Creator":
        return renderCreatorCell(cellCtx);
      case "Reviewer":
        return renderReviewerCell(cellCtx);
      case "Remarks":
        return renderRemarksCell(cellCtx);
      case "Status":
        return renderStatusCell(cellCtx);
      default:
        return null;
    }
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

    </TableRow>
  );
});