import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronsLeftRight,
  Hand,
  Plus,
} from "lucide-react";
import { WorksheetColumnMenu } from "./WorksheetColumnMenu";
import { FilterMultiSelect } from "./FilterMultiSelect";
import { buildGridTemplateColumns } from "@/constants/worksheetColumnWidths";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "../ui/table";
import { Checkbox } from "../ui/checkbox";
import { WorkSheetRow } from "./WorkSheetRow";
import { focusCheckboxRow } from "./useWorksheetKeyboardNavigation";
import { WORKSHEET } from "@/constants/testIds";
import { toast } from "sonner";
import { canEditWorkItem } from "@/lib/worksheetPermissions";

const COLUMNS = [
  "Date",
  "Client",
  "Project",
  "Deliverable",
  "Stage",
  "Deliverable Name",
  "Deliverable Link",
  "Deliverable Type",
  "Category",
  "Version",
  "Time (min)",
  "Creator",
  "Reviewer",
  "Remarks",
  "Status",
];

const FILL_FIELDS = {
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

const COLUMN_FIELDS = {
  Date: "work_date",
  Client: "client_id",
  Project: "project_id",
  Deliverable: "deliverable_id",
  Stage: "stage",
  "Deliverable Name": "deliverable_name",
  "Deliverable Link": "deliverable_link",
  "Deliverable Type": "deliverable_type",
  Category: "work_category",
  Version: "version",
  "Time (min)": "time_taken_minutes",
  Creator: "creator_id",
  Reviewer: "reviewer_id",
  Remarks: "remarks",
  Status: "status",
};

const STAGES = ["Content", "Design", "Animate", "Finish"];
const MEMBER_STAGE_BY_DEPARTMENT = {
  Content: "Content",
  Design: "Design",
  Animation: "Animate",
  Finish: "Finish",
};

// The worksheet is intentionally virtualized without adding a new dependency.
// Only the visible rows + a small overscan buffer are mounted in the DOM.
const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 40;
const OVERSCAN = 20;

export const WorkSheetTable = forwardRef(function WorkSheetTable({
  items,
  currentUser,
  users,
  options,
  projects,
  deliverables,
  clients = [],
  onUpdate,
  onDelete,
  onFill,
  filters,
  setFilters,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  hiddenRows,
  setHiddenRows,
  onAddRow,
  addingRow = false,
  onSelectRange,
  sheetKey = "Master",
}, ref) {
  const [activeCell, setActiveCell] = useState(null);
  const [selection, setSelection] = useState(null);
  const [rangeSelection, setRangeSelection] = useState(null);
  const rangeSelectionRef = useRef(null);
  const activeCellRef = useRef(null);
  const checkboxAnchorRef = useRef(null);
  const [columnSort, setColumnSort] = useState({
    key: null,
    direction: "asc",
  });

  const [hiddenColumns, setHiddenColumns] = useState(() => {
    try {
      const saved = localStorage.getItem("worksheet_hidden_columns");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const columnOrderKey = `worksheet_column_order_${currentUser.id}`;
  const rowOrderKey = `worksheet_row_order_${currentUser.id}_${sheetKey}`;

  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`worksheet_column_order_${currentUser.id}`) || "null");
      if (!Array.isArray(saved)) return COLUMNS;
      const valid = saved.filter((column) => COLUMNS.includes(column));
      const missing = COLUMNS.filter((column) => !valid.includes(column));
      return [...valid, ...missing];
    } catch {
      return COLUMNS;
    }
  });

  const [rowOrder, setRowOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`worksheet_row_order_${currentUser.id}_${sheetKey}`) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [draggedRow, setDraggedRow] = useState(null);
  const rowOrderScopeRef = useRef(rowOrderKey);
  const [fillState, setFillState] = useState(null);
  const [isFilling, setIsFilling] = useState(false);

  const scrollRef = useRef(null);
  const fillStateRef = useRef(null);
  const itemsRef = useRef(items);
  const sortedItemsRef = useRef(items);
  const onFillRef = useRef(onFill);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);

  // Exposed so the page can force the sheet back to its default
  // (newest-first) order when a row is added — otherwise a row added
  // while a per-column sort is active lands wherever that column's
  // sort puts it instead of being visible at the top. Also scrolls the
  // (virtualized) table back to the top, since the new row is only
  // ever rendered there — without this, adding a row while scrolled
  // further down never brings it into view, which looks identical to
  // "it got added at the bottom."
  useImperativeHandle(ref, () => ({
    resetColumnSort: () => setColumnSort({ key: null, direction: "asc" }),
    scrollToTop: () => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
      setScrollTop(0);
    },
  }), []);

  useEffect(() => {
    localStorage.setItem(columnOrderKey, JSON.stringify(columnOrder));
  }, [columnOrder, columnOrderKey]);

  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(`worksheet_row_order_${currentUser.id}_${sheetKey}`) || "[]"
      );
      setRowOrder(Array.isArray(saved) ? saved : []);
    } catch {
      setRowOrder([]);
    }
    rowOrderScopeRef.current = rowOrderKey;
  }, [currentUser.id, sheetKey, rowOrderKey]);

  useEffect(() => {
    setRowOrder((current) => {
      const missing = items
        .map((item) => item.id)
        .filter((id) => !current.includes(id));
      // New/never-ordered rows (e.g. one just created via "+") go to the
      // FRONT of the saved drag order, not the back. This effect fires
      // right after a row is added — appending to the end would silently
      // undo the "show brand-new rows at the top" behavior on the very
      // next tick, which is exactly what was happening before this fix.
      return missing.length ? [...missing, ...current] : current;
    });
  }, [items]);

  useEffect(() => {
    if (rowOrderScopeRef.current !== rowOrderKey) return;
    localStorage.setItem(rowOrderKey, JSON.stringify(rowOrder));
  }, [rowOrder, rowOrderKey]);

  useEffect(() => {
    localStorage.setItem(
      "worksheet_hidden_columns",
      JSON.stringify(hiddenColumns)
    );
  }, [hiddenColumns]);

  // Pre-index data once instead of doing a full .filter() inside every row.
  const deliverablesByProject = useMemo(() => {
    const map = {};

    for (const deliverable of deliverables || []) {
      if (!deliverable.project_id) continue;

      if (!map[deliverable.project_id]) {
        map[deliverable.project_id] = [];
      }

      map[deliverable.project_id].push(deliverable);
    }

    return map;
  }, [deliverables]);

  const usersById = useMemo(() => {
    const map = {};

    for (const user of users || []) {
      map[user.id] = user;
    }

    return map;
  }, [users]);

  const nonAdminUsers = useMemo(
    () => (users || []).filter((user) => user.role !== "admin"),
    [users]
  );

  const reviewerUsers = useMemo(
    () => (users || []).filter((user) => user.role !== "member"),
    [users]
  );

  // Value lists for the per-column filter menus. Memoized on the
  // underlying data only (not on `filters` or any per-render state), so
  // opening/using one column's filter never recomputes or re-renders the
  // others — same reasoning as the big filter panel's fix.
  const projectFilterValues = useMemo(
    () => (projects || []).map((p) => ({ value: p.id, label: p.name })),
    [projects]
  );
  const deliverableFilterValues = useMemo(
    () => (deliverables || []).map((d) => ({ value: d.id, label: d.name })),
    [deliverables]
  );
  const stageFilterValues = useMemo(
    () => (options.stages || []).map((s) => ({ value: s, label: s })),
    [options.stages]
  );
  const typeFilterValues = useMemo(
    () => (options.deliverable_types || []).map((t) => ({ value: t, label: t })),
    [options.deliverable_types]
  );
  const categoryFilterValues = useMemo(
    () => (options.work_categories || []).map((c) => ({ value: c, label: c })),
    [options.work_categories]
  );
  const statusFilterValues = useMemo(
    () => (options.statuses || []).map((s) => ({ value: s, label: s })),
    [options.statuses]
  );
  const creatorFilterValues = useMemo(
    () => nonAdminUsers.map((u) => ({ value: u.id, label: u.name })),
    [nonAdminUsers]
  );
  const reviewerFilterValues = useMemo(
    () => reviewerUsers.map((u) => ({ value: u.id, label: u.name })),
    [reviewerUsers]
  );

  // Maps a column to its filter field(s) in the `filters` object. Columns
  // not listed here (Client, Deliverable Name, Deliverable Link, Version,
  // Time (min), Remarks) have no filter — their column menu only offers
  // Sort and Hide.
  const COLUMN_FILTER_KEYS = {
    Project: "project_ids",
    Deliverable: "deliverable_ids",
    Stage: "stages",
    "Deliverable Type": "deliverable_types",
    Category: "work_categories",
    Creator: "creator_ids",
    Reviewer: "reviewer_ids",
    Status: "statuses",
  };

  const COLUMN_FILTER_VALUES = {
    Project: projectFilterValues,
    Deliverable: deliverableFilterValues,
    Stage: stageFilterValues,
    "Deliverable Type": typeFilterValues,
    Category: categoryFilterValues,
    Creator: creatorFilterValues,
    Reviewer: reviewerFilterValues,
    Status: statusFilterValues,
  };

  // Stable across renders (only depends on setFilters, itself stable from
  // the page's useCallback) — passed to FilterMultiSelect as its onChange.
  const updateColumnFilter = useCallback(
    (key, value) => {
      setFilters?.((prev) => ({ ...prev, [key]: value }));
    },
    [setFilters]
  );

  // Renders the scoped control shown inside a single column's dropdown —
  // just that column's own filter, not the full filter panel.
  const renderColumnFilterControl = (column) => {
    if (!setFilters) return null;

    if (column === "Date") {
      return (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] text-slate-500">From</label>
            <input
              type="date"
              value={filters?.date_from || ""}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, date_from: e.target.value }))
              }
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-slate-500">To</label>
            <input
              type="date"
              value={filters?.date_to || ""}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, date_to: e.target.value }))
              }
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      );
    }

    const key = COLUMN_FILTER_KEYS[column];
    if (!key) return null;

    return (
      <FilterMultiSelect
        filterKey={key}
        values={COLUMN_FILTER_VALUES[column] || []}
        selected={filters?.[key] || []}
        onChange={updateColumnFilter}
      />
    );
  };

  const clearColumnFilter = (column) => {
    if (!setFilters) return;

    if (column === "Date") {
      setFilters((prev) => ({ ...prev, date_from: "", date_to: "" }));
      return;
    }

    const key = COLUMN_FILTER_KEYS[column];
    if (!key) return;

    setFilters((prev) => ({ ...prev, [key]: [] }));
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const getSortValue = useCallback(
    (item, column) => {
      const field = COLUMN_FIELDS[column];

      if (!field) return "";

      let value = item[field];

      if (column === "Client") {
        const project = projects.find((p) => p.id === item.project_id);
        const clientId = item.client_id || project?.client_id;
        value = clients.find((c) => c.id === clientId)?.name || "";
      }

      if (column === "Project") {
        value = projects.find((p) => p.id === item.project_id)?.name || "";
      }

      if (column === "Deliverable") {
        value =
          deliverables.find((d) => d.id === item.deliverable_id)?.name || "";
      }

      if (column === "Creator") {
        value = usersById[item.creator_id]?.name || "";
      }

      if (column === "Reviewer") {
        value = usersById[item.reviewer_id]?.name || "";
      }

      if (value === null || value === undefined) return "";

      return value;
    },
    [clients, projects, deliverables, usersById]
  );

  const hiddenRowSet = useMemo(
    () => new Set(hiddenRows),
    [hiddenRows]
  );

  const sortedAllTableItems = useMemo(() => {
    if (!columnSort.key) {
      return items;
    }

    const sorted = [...items];

    sorted.sort((a, b) => {
      const aValue = getSortValue(a, columnSort.key);
      const bValue = getSortValue(b, columnSort.key);

      if (typeof aValue === "number" && typeof bValue === "number") {
        return columnSort.direction === "asc"
          ? aValue - bValue
          : bValue - aValue;
      }

      return columnSort.direction === "asc"
        ? String(aValue).localeCompare(String(bValue), undefined, {
            numeric: true,
            sensitivity: "base",
          })
        : String(bValue).localeCompare(String(aValue), undefined, {
            numeric: true,
            sensitivity: "base",
          });
    });

    return sorted;
  }, [items, columnSort, getSortValue]);

  const personallyOrderedItems = useMemo(() => {
    if (!rowOrder.length || columnSort.key) return sortedAllTableItems;

    const byId = new Map(sortedAllTableItems.map((item) => [item.id, item]));
    const ordered = rowOrder
      .map((id) => byId.get(id))
      .filter(Boolean);
    const orderedIds = new Set(ordered.map((item) => item.id));

    // Items not yet part of the saved drag order are newly added rows —
    // surface them at the top instead of burying them after everything
    // the user has already arranged.
    return [
      ...sortedAllTableItems.filter((item) => !orderedIds.has(item.id)),
      ...ordered,
    ];
  }, [sortedAllTableItems, rowOrder, columnSort.key]);

  const visibleTableItems = useMemo(
    () => personallyOrderedItems.filter((item) => !hiddenRowSet.has(item.id)),
    [personallyOrderedItems, hiddenRowSet]
  );

  const sortedTableItems = visibleTableItems;

  // Tracks which hidden rows sit immediately before each visible row.
  const hiddenRowsBeforeById = useMemo(() => {
    const result = {};
    let pendingHiddenRows = [];

    for (const item of personallyOrderedItems) {
      if (hiddenRowSet.has(item.id)) {
        pendingHiddenRows.push(item.id);
        continue;
      }

      result[item.id] = pendingHiddenRows;
      pendingHiddenRows = [];
    }

    result.__trailing__ = pendingHiddenRows;

    return result;
  }, [personallyOrderedItems, hiddenRowSet]);

  const displayRowNumberById = useMemo(() => {
    const result = {};

    personallyOrderedItems.forEach((item, index) => {
      result[item.id] = index + 1;
    });

    return result;
  }, [personallyOrderedItems]);

  useEffect(() => {
    itemsRef.current = items;
    sortedItemsRef.current = sortedTableItems;
    onFillRef.current = onFill;
  }, [items, sortedTableItems, onFill]);

  const handleCellSelect = useCallback(({ row, col }) => {
    setActiveCell({ row, col });
    activeCellRef.current = { row, col };
    setSelection({
      startRow: row,
      endRow: row,
      col,
    });

    // A plain click/focus on a different cell always collapses any
    // Shift+Arrow range from before, same as Google Sheets. But
    // Shift+Arrow itself blurs-then-refocuses this same anchor cell on
    // every keystroke (to commit the typed value without losing focus —
    // see useWorksheetKeyboardNavigation.js), which fires this exact
    // handler too. If that refocus is what's happening — same cell as
    // the range's own anchor — the range must survive it, or repeated
    // Shift+Down could never extend past a single extra cell: each
    // keystroke's own refocus would wipe out the previous extension
    // right before applying the next one.
    const currentRange = rangeSelectionRef.current;
    const isOwnRangeAnchorRefocusing =
      currentRange &&
      currentRange.anchorRow === row &&
      currentRange.anchorCol === col;

    if (!isOwnRangeAnchorRefocusing) {
      rangeSelectionRef.current = null;
      setRangeSelection(null);
    }
  }, []);

  // Shift(+Ctrl)+Arrow — grows/shrinks the rectangle from a fixed anchor
  // (the cell that was focused when the shift-session started) without
  // moving focus. Ctrl/Cmd jumps straight to that edge of the sheet in
  // one step instead of moving one cell at a time.
  const handleExtendSelection = useCallback(
    ({ anchorRow, anchorCol, direction, jumpToEdge, maxRow, maxCol }) => {
      const current = rangeSelectionRef.current;
      const base =
        current &&
        current.anchorRow === anchorRow &&
        current.anchorCol === anchorCol
          ? current
          : { anchorRow, anchorCol, row: anchorRow, col: anchorCol };

      let { row, col } = base;

      if (direction === "up") row = jumpToEdge ? 1 : Math.max(1, row - 1);
      if (direction === "down")
        row = jumpToEdge ? maxRow : Math.min(maxRow, row + 1);
      if (direction === "left") col = jumpToEdge ? 0 : Math.max(0, col - 1);
      if (direction === "right")
        col = jumpToEdge ? maxCol : Math.min(maxCol, col + 1);

      const next = { anchorRow, anchorCol, row, col };
      rangeSelectionRef.current = next;
      setRangeSelection(next);
    },
    []
  );

  // Click a checkbox, then Shift+Down/Up to bulk-select rows in between —
  // same as a spreadsheet's row-header selection. The anchor is whichever
  // row's checkbox was last plainly clicked; falls back to the current
  // row if nothing's been clicked yet this session.
  const handleCheckboxRangeSelect = useCallback(
    (currentRow, direction) => {
      const anchor = checkboxAnchorRef.current ?? currentRow;
      const targetRow = direction === "down" ? currentRow + 1 : currentRow - 1;
      const clampedTarget = Math.max(
        1,
        Math.min(sortedItemsRef.current.length, targetRow)
      );

      const start = Math.min(anchor, clampedTarget);
      const end = Math.max(anchor, clampedTarget);
      const ids = sortedItemsRef.current
        .slice(start - 1, end)
        .map((entry) => entry.id);

      checkboxAnchorRef.current = anchor;
      onSelectRange?.(ids);
      requestAnimationFrame(() => focusCheckboxRow(clampedTarget));
    },
    [onSelectRange]
  );

  const handleCheckboxToggle = useCallback(
    (id, rowIndex) => {
      checkboxAnchorRef.current = rowIndex;
      onToggleSelect(id);
      // Row-checkbox selection and the keyboard cell-range selection are
      // two different modes; clicking a checkbox means the user has
      // moved on to row-level selection, so the cell-range highlight
      // shouldn't linger.
      rangeSelectionRef.current = null;
      setRangeSelection(null);
    },
    [onToggleSelect]
  );

  const handleFillStart = useCallback(({ row, col }) => {
    const next = {
      sourceRow: row,
      sourceCol: col,
      targetRow: row,
    };

    fillStateRef.current = next;
    setIsFilling(true);
    setFillState(next);

    setSelection({
      startRow: row,
      endRow: row,
      col,
    });
  }, []);

  const handleFillHover = useCallback((row) => {
    const current = fillStateRef.current;
    if (!current) return;

    const next = {
      ...current,
      targetRow: row,
    };

    fillStateRef.current = next;
    setFillState(next);

    setSelection((prev) => {
      if (!prev) return prev;
      return { ...prev, endRow: row };
    });
  }, []);

  const handleFillEnd = useCallback(async () => {
    const current = fillStateRef.current;

    fillStateRef.current = null;
    setIsFilling(false);
    setFillState(null);
    setSelection(null);

    if (!current || current.targetRow <= current.sourceRow) return;

    const sourceColumn = columnOrder[current.sourceCol];
    const field = COLUMN_FIELDS[sourceColumn];
    const currentItems = sortedItemsRef.current;
    const sourceItem = currentItems[current.sourceRow - 1];

    if (!field || !sourceItem) return;

    const value = sourceItem[field];
    const targetIds = currentItems
      .slice(current.sourceRow, current.targetRow)
      .map((item) => item.id);

    if (!targetIds.length) return;

    try {
      await onFillRef.current(targetIds, field, value);
    } catch {
      // onFill is responsible for displaying the persistence error.
    }
  }, [columnOrder]);

  // Global pointer tracking while a fill drag is active.
  useEffect(() => {
    if (!isFilling) return undefined;

    const handlePointerMove = (event) => {
      const element = document.elementFromPoint(
        event.clientX,
        event.clientY
      );

      const cell = element?.closest("[data-sheet-cell]");
      if (!cell) return;

      const row = Number(cell.getAttribute("data-sheet-row"));
      if (Number.isNaN(row)) return;

      handleFillHover(row);
    };

    const handlePointerUp = () => {
      handleFillEnd();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isFilling, handleFillHover, handleFillEnd]);

  // Measure the scroll viewport so the number of mounted rows stays small.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;

    const updateViewport = () => {
      setViewportHeight(Math.max(200, element.clientHeight));
    };

    updateViewport();

    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((event) => {
    setScrollTop(event.currentTarget.scrollTop);
  }, []);

  const bodyScrollTop = Math.max(0, scrollTop - HEADER_HEIGHT);

  const visibleStart = Math.max(
    0,
    Math.floor(bodyScrollTop / ROW_HEIGHT) - OVERSCAN
  );

  const visibleEnd = Math.min(
    sortedTableItems.length,
    Math.ceil((bodyScrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN
  );

  const visibleItems = sortedTableItems.slice(visibleStart, visibleEnd);
  const topSpacerHeight = visibleStart * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(
    0,
    (sortedTableItems.length - visibleEnd) * ROW_HEIGHT
  );

  const allVisibleIds = useMemo(
    () => sortedTableItems.map((item) => item.id),
    [sortedTableItems]
  );

  const allSelected =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedSet.has(id));

  const visibleColumns = columnOrder.filter((column) => !hiddenColumns.includes(column));

  const isMember = currentUser.role === "member";
  const memberStage = MEMBER_STAGE_BY_DEPARTMENT[currentUser.department];

  const canEditItem = useCallback(
    (item) =>
      isMember
        ? !item.stage || item.stage === memberStage
        : canEditWorkItem(currentUser, item, users),
    [isMember, memberStage, currentUser, users]
  );

  // Turns pasted display text back into the raw field(s) to save for a
  // column, resolved against the target row's own current context (e.g.
  // "Project" is matched only within the target's client). Returns null
  // when the text doesn't match anything valid for that column, so the
  // caller can skip that cell rather than write garbage.
  const resolvePasteValue = useCallback(
    (column, rawText, targetItem) => {
      const text = (rawText ?? "").trim();
      const clear = text === "" || text === "—" || text === "-";
      const ciEquals = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

      switch (column) {
        case "Date": {
          if (clear) return { work_date: "" };
          if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { work_date: text };
          const parsed = new Date(text);
          if (Number.isNaN(parsed.getTime())) return null;
          return { work_date: parsed.toISOString().slice(0, 10) };
        }
        case "Client": {
          if (clear) {
            return { client_id: null, project_id: null, deliverable_id: null };
          }
          const match = clients.find((c) => ciEquals(c.name, text));
          if (!match) return null;
          return {
            client_id: match.id,
            project_id: null,
            deliverable_id: null,
          };
        }
        case "Project": {
          if (clear) return { project_id: null, deliverable_id: null };
          const currentProject = projects.find(
            (p) => p.id === targetItem.project_id
          );
          const effectiveClientId =
            targetItem.client_id || currentProject?.client_id;
          const pool = effectiveClientId
            ? projects.filter((p) => p.client_id === effectiveClientId)
            : projects;
          const match = pool.find((p) => ciEquals(p.name, text));
          if (!match) return null;
          return { project_id: match.id, deliverable_id: null };
        }
        case "Deliverable": {
          if (clear) return { deliverable_id: null };
          const pool = deliverablesByProject[targetItem.project_id] || [];
          const match = pool.find((d) => ciEquals(d.name, text));
          if (!match) return null;
          return { deliverable_id: match.id };
        }
        case "Stage": {
          if (clear) return { stage: null };
          const match = STAGES.find((s) => ciEquals(s, text));
          if (!match) return null;
          return { stage: match };
        }
        case "Deliverable Name":
          return { deliverable_name: clear ? "" : text };
        case "Deliverable Link":
          return { deliverable_link: clear ? "" : text };
        case "Deliverable Type": {
          if (clear) return { deliverable_type: "", work_category: "" };
          const match = (options.deliverable_types || []).find((t) =>
            ciEquals(t, text)
          );
          if (!match) return null;
          return {
            deliverable_type: match,
            work_category: options.deliverable_type_categories?.[match] || "",
          };
        }
        // Category is derived from Type, not directly editable anywhere
        // else in the sheet — paste shouldn't be able to set it either.
        case "Category":
          return null;
        case "Version":
          return { version: clear ? "" : text };
        case "Time (min)": {
          if (clear) return { time_taken_minutes: 0 };
          const num = Number(text.replace(/[^\d.-]/g, ""));
          if (Number.isNaN(num)) return null;
          return { time_taken_minutes: num };
        }
        case "Creator": {
          if (clear) return { creator_id: null };
          const match = nonAdminUsers.find((u) => ciEquals(u.name, text));
          if (!match) return null;
          return { creator_id: match.id };
        }
        case "Reviewer": {
          if (clear) return { reviewer_id: null };
          const match = reviewerUsers.find((u) => ciEquals(u.name, text));
          if (!match) return null;
          return { reviewer_id: match.id };
        }
        case "Remarks":
          return { remarks: clear ? "" : text };
        case "Status": {
          const match = (options.statuses || []).find((s) => ciEquals(s, text));
          if (!match) return null;
          return { status: match };
        }
        default:
          return null;
      }
    },
    [clients, projects, deliverablesByProject, options, nonAdminUsers, reviewerUsers]
  );

  // Ctrl/Cmd+C copies the active cell or, if a Shift+Arrow range is
  // selected, the whole rectangle — as tab/newline-separated text, so it
  // also pastes cleanly into Excel/Sheets/a text editor. Ctrl/Cmd+V does
  // the reverse: parses clipboard text the same way and writes each cell
  // back through onUpdate, resolving names back to IDs per column (e.g.
  // pasting "Ongoing" into Status, or a project name matched against the
  // target row's own client).
  useEffect(() => {
    const isWithinSheet = (el) => !!el?.closest?.("[data-sheet-cell]");

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const isCopy = (event.ctrlKey || event.metaKey) && key === "c";
      const isPaste = (event.ctrlKey || event.metaKey) && key === "v";
      if (!isCopy && !isPaste) return;

      const target = event.target;

      // Inside a text field with its own text actually selected, let the
      // browser's normal text copy/paste happen instead of hijacking it.
      if (
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement) &&
        target.selectionStart !== target.selectionEnd
      ) {
        return;
      }

      if (!isWithinSheet(document.activeElement)) return;

      if (!navigator.clipboard) {
        toast.error(
          "Clipboard access isn't available here (needs HTTPS or a supported browser)"
        );
        return;
      }

      // Read the anchor cell straight off whatever DOM element actually
      // has focus right now, rather than trusting activeCellRef to have
      // stayed perfectly in sync with it. A ref that mirrors focus state
      // can drift stale (state updates and DOM focus don't always land
      // in the same tick); the focused element's own data-sheet-row/col
      // attributes can't be stale — they describe exactly what's focused
      // at this exact moment, which is what paste should target.
      const focusedCellEl = document.activeElement?.closest?.(
        "[data-sheet-cell]"
      );
      const domRow = focusedCellEl
        ? Number(focusedCellEl.getAttribute("data-sheet-row"))
        : null;
      const domCol = focusedCellEl
        ? Number(focusedCellEl.getAttribute("data-sheet-col"))
        : null;
      const domAnchor =
        Number.isFinite(domRow) && Number.isFinite(domCol)
          ? { row: domRow, col: domCol }
          : null;

      const rawRange = rangeSelectionRef.current;

      // A range selection can only still be "live" if whatever's
      // currently focused is actually inside it. If the DOM says focus
      // is on a cell outside that range, the range is a leftover from
      // an earlier, unrelated interaction (e.g. a prior Shift+Arrow
      // session) that never got cleared on every path — trust the fresh
      // click over it rather than silently pasting into stale
      // coordinates.
      const rangeContainsDomAnchor =
        rawRange &&
        domAnchor &&
        domAnchor.row >= Math.min(rawRange.anchorRow, rawRange.row) &&
        domAnchor.row <= Math.max(rawRange.anchorRow, rawRange.row) &&
        domAnchor.col >= Math.min(rawRange.anchorCol, rawRange.col) &&
        domAnchor.col <= Math.max(rawRange.anchorCol, rawRange.col);

      const range = !domAnchor || rangeContainsDomAnchor ? rawRange : null;
      const anchor = domAnchor || activeCellRef.current;
      if (!range && !anchor) return;

      // eslint-disable-next-line no-console
      console.log("[worksheet paste] anchor detection:", {
        domAnchor,
        activeCellRefCurrent: activeCellRef.current,
        rawRange,
        rangeContainsDomAnchor,
        usingRange: range,
        usingAnchor: anchor,
      });

      const startRow = range ? Math.min(range.anchorRow, range.row) : anchor.row;
      const endRow = range ? Math.max(range.anchorRow, range.row) : anchor.row;
      const startCol = range ? Math.min(range.anchorCol, range.col) : anchor.col;
      const endCol = range ? Math.max(range.anchorCol, range.col) : anchor.col;

      if (isCopy) {
        event.preventDefault();
        const cols = visibleColumns.slice(startCol, endCol + 1);
        const rowsData = sortedItemsRef.current.slice(startRow - 1, endRow);

        const tsv = rowsData
          .map((item) =>
            cols.map((column) => String(getSortValue(item, column) ?? "")).join("\t")
          )
          .join("\n");

        navigator.clipboard
          .writeText(tsv)
          .then(() => {
            const count = rowsData.length * cols.length;
            toast.success(count > 1 ? `Copied ${count} cells` : "Copied");
          })
          .catch(() => {
            toast.error("Couldn't copy — clipboard access was blocked");
          });

        return;
      }

      // Paste.
      event.preventDefault();

      navigator.clipboard
        .readText()
        .then(async (clipboardText) => {
          if (!clipboardText) return;

          const pastedRows = clipboardText.replace(/\r/g, "").split("\n");
          const pastedGrid = pastedRows.map((line) => line.split("\t"));
          const isSingleValue =
            pastedGrid.length === 1 && pastedGrid[0].length === 1;

          // A single copied value pasted onto a multi-cell range fills
          // the whole range with it (same as Sheets); otherwise the
          // pasted block is stamped once, anchored at the range/active
          // cell's top-left corner, clamped to the sheet's bounds.
          const targetRowCount = isSingleValue
            ? endRow - startRow + 1
            : pastedGrid.length;
          const targetColCount = isSingleValue
            ? endCol - startCol + 1
            : pastedGrid[0].length;

          const maxRow = sortedItemsRef.current.length;
          const maxCol = visibleColumns.length - 1;

          let applied = 0;
          let skipped = 0;

          const targetedRows = [];

          for (let r = 0; r < targetRowCount; r++) {
            const targetRow = startRow + r;
            if (targetRow > maxRow) break;

            const targetItem = sortedItemsRef.current[targetRow - 1];
            if (!targetItem || !canEditItem(targetItem)) {
              skipped += targetColCount;
              continue;
            }

            const updates = {};
            let rowHasUpdate = false;

            for (let c = 0; c < targetColCount; c++) {
              const targetCol = startCol + c;
              if (targetCol > maxCol) break;

              const column = visibleColumns[targetCol];
              const text = isSingleValue
                ? pastedGrid[0][0]
                : pastedGrid[r % pastedGrid.length][c % pastedGrid[0].length];

              const resolved = column
                ? resolvePasteValue(column, text, targetItem)
                : null;

              if (!resolved) {
                skipped += 1;
                continue;
              }

              Object.assign(updates, resolved);
              rowHasUpdate = true;
            }

            if (rowHasUpdate) {
              // IMPORTANT:
              // Wait for the API/MongoDB update before counting
              // this row as successfully pasted.
              const result = await onUpdate(targetItem.id, updates);

              if (result?.success) {
                applied += 1;
                targetedRows.push(targetRow);
              } else {
                skipped += Object.keys(updates).length;
              }
            }
          }

          if (applied === 0) {
            toast.error("Nothing pasted — no changes were saved");
          } else if (skipped > 0) {
            toast.success(`Pasted into row ${targetedRows.join(", ")} — skipped ${skipped} cell${skipped === 1 ? "" : "s"} that couldn't be saved`);
          } else {
            toast.success(`Pasted into row ${targetedRows.join(", ")}`);
          }
        })
        .catch(() => {
          toast.error("Couldn't paste — clipboard access was blocked");
        });
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visibleColumns, getSortValue, resolvePasteValue, canEditItem, onUpdate]);

  const gridTemplateColumns = buildGridTemplateColumns(visibleColumns);

  const totalCols = COLUMNS.length + 3; // #, checkbox, Actions

  const handleColumnDrop = (targetColumn) => {
    if (!draggedColumn || draggedColumn === targetColumn) return;

    setColumnOrder((current) => {
      const next = [...current];
      const fromIndex = next.indexOf(draggedColumn);
      const toIndex = next.indexOf(targetColumn);
      if (fromIndex === -1 || toIndex === -1) return current;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, draggedColumn);
      return next;
    });
    setActiveCell(null);
    setSelection(null);
    setDraggedColumn(null);
  };

  const handleRowDrop = (targetId) => {
    if (columnSort.key || !draggedRow || draggedRow === targetId) return;

    setRowOrder((current) => {
      const next = current.length ? [...current] : items.map((item) => item.id);
      const fromIndex = next.indexOf(draggedRow);
      const toIndex = next.indexOf(targetId);
      if (fromIndex === -1 || toIndex === -1) return current;
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, draggedRow);
      return next;
    });
    setActiveCell(null);
    setSelection(null);
    setDraggedRow(null);
  };

  const getHiddenColumnsAfter = (columnIndex) => {
    const hidden = [];

    for (let i = columnIndex + 1; i < columnOrder.length; i += 1) {
      if (!hiddenColumns.includes(columnOrder[i])) {
        break;
      }

      hidden.push(columnOrder[i]);
    }

    return hidden;
  };

  const getHiddenColumnsFromStart = () => {
    const hidden = [];

    for (const column of columnOrder) {
      if (!hiddenColumns.includes(column)) {
        break;
      }

      hidden.push(column);
    }

    return hidden;
  };

  const restoreHiddenColumns = (columns) => {
    setHiddenColumns((current) =>
      current.filter((column) => !columns.includes(column))
    );
  };

  const restoreHiddenRows = (rowIds) => {
    if (!rowIds?.length) return;

    setHiddenRows((current) =>
      current.filter((id) => !rowIds.includes(id))
    );
  };

  // A column funnel is shown as active only when that column has a
  // corresponding filter applied in the universal filter panel.
  const isColumnFiltered = (column) => {
    switch (column) {
      case "Date":
        return Boolean(filters?.date_from || filters?.date_to);
      case "Project":
        return Boolean(filters?.project_ids?.length);
      case "Deliverable":
        return Boolean(filters?.deliverable_ids?.length);
      case "Stage":
        return Boolean(filters?.stages?.length);
      case "Deliverable Type":
        return Boolean(filters?.deliverable_types?.length);
      case "Category":
        return Boolean(filters?.work_categories?.length);
      case "Creator":
        return Boolean(filters?.creator_ids?.length);
      case "Reviewer":
        return Boolean(filters?.reviewer_ids?.length);
      case "Status":
        return Boolean(filters?.statuses?.length);
      default:
        return false;
    }
  };

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-auto bg-white sheet-mode"
    >
      <Table
        data-testid={WORKSHEET.table}
        className="min-w-max border-collapse"
      >
        <TableHeader>
          <TableRow
            className="border-b border-slate-200 bg-[#f7f9fc] hover:bg-[#f7f9fc]"
            style={{ display: "grid", gridTemplateColumns, minWidth: "max-content" }}
          >
            <TableHead className="row-num-head flex h-10 items-center justify-center border-r border-slate-200 px-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500" style={{ gridColumn: 1 }}>
              {onAddRow ? (
                <button
                  type="button"
                  onClick={onAddRow}
                  disabled={addingRow}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm transition-all hover:scale-105 hover:bg-indigo-700 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
                  title="Add a row"
                  aria-label="Add a row"
                  data-testid="worksheet-add-row-btn"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.75} />
                </button>
              ) : (
                "#"
              )}
            </TableHead>

            <TableHead className="checkbox-cell relative flex h-10 items-center border-r border-slate-200 px-3" style={{ gridColumn: 2 }}>
              <Checkbox
                data-testid="worksheet-select-all-checkbox"
                checked={allSelected}
                onCheckedChange={onToggleSelectAll}
                disabled={allVisibleIds.length === 0}
              />

              {getHiddenColumnsFromStart().length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    restoreHiddenColumns(getHiddenColumnsFromStart())
                  }
                  className="absolute -right-2 top-1/2 z-30 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-blue-50 hover:text-blue-600"
                  title={`Show ${getHiddenColumnsFromStart().length} hidden column${
                    getHiddenColumnsFromStart().length === 1 ? "" : "s"
                  }`}
                  aria-label="Show hidden columns"
                >
                  <ChevronsLeftRight className="h-3 w-3" />
                </button>
              )}
            </TableHead>

            {columnOrder.map((column, columnIndex) => {
              const isHidden = hiddenColumns.includes(column);

              if (isHidden) {
                return null;
              }

              const hiddenAfter = getHiddenColumnsAfter(columnIndex);

              return (
                <TableHead
                  key={column}
                  className={`group relative flex h-10 min-w-0 items-center whitespace-nowrap border-r border-slate-200 px-1 text-[12px] font-semibold text-slate-600 ${
                    draggedColumn === column ? "opacity-50" : ""
                  }`}
                  style={{ gridColumn: visibleColumns.indexOf(column) + 3 }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleColumnDrop(column)}
                >
                  <div
                    className="group/header flex min-w-0 items-center gap-0"
                    draggable
                    onDragStart={(event) => {
                      event.stopPropagation();
                      setDraggedColumn(column);
                    }}
                    onDragEnd={() => setDraggedColumn(null)}
                    title={`Drag ${column} column`}
                  >
                    <span
                      aria-hidden="true"
                      className="mr-0.5 inline-flex h-5 w-4 shrink-0 cursor-grab items-center justify-center rounded text-slate-400 opacity-0 transition-opacity group-hover/header:opacity-100 active:cursor-grabbing"
                    >
                      <Hand className="h-3.5 w-3.5" />
                    </span>

                    <button
                      type="button"
                      onClick={(event) => event.stopPropagation()}
                      className="flex min-w-0 flex-1 items-center justify-start overflow-hidden rounded px-0 py-0.5 text-left hover:text-slate-800"
                      title={column}
                    >
                      <span className="min-w-0 truncate">{column}</span>
                    </button>

                    <WorksheetColumnMenu
                      column={column}
                      isSorted={columnSort.key === column}
                      isFiltered={isColumnFiltered(column)}
                      onSortAsc={() =>
                        setColumnSort({
                          key: column,
                          direction: "asc",
                        })
                      }
                      onSortDesc={() =>
                        setColumnSort({
                          key: column,
                          direction: "desc",
                        })
                      }
                      onHide={() =>
                        setHiddenColumns((current) =>
                          current.includes(column)
                            ? current
                            : [...current, column]
                        )
                      }
                      filterControl={renderColumnFilterControl(column)}
                      onClearFilter={() => clearColumnFilter(column)}
                    />
                  </div>

                  {hiddenAfter.length > 0 && (
                    <button
                      type="button"
                      onClick={() => restoreHiddenColumns(hiddenAfter)}
                      className="absolute -right-2 top-1/2 z-30 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm transition hover:bg-blue-50 hover:text-blue-600"
                      title={`Show ${hiddenAfter.length} hidden column${
                        hiddenAfter.length === 1 ? "" : "s"
                      }`}
                      aria-label="Show hidden columns"
                    >
                      <ChevronsLeftRight className="h-3 w-3" />
                    </button>
                  )}
                </TableHead>
              );
            })}

            <TableHead className="flex h-10 w-[52px] items-center justify-center border-r border-slate-200 px-3 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500" style={{ gridColumn: visibleColumns.length + 3 }}>
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {sortedTableItems.length === 0 ? (
            <TableRow>
              <td
                colSpan={totalCols}
                data-testid={WORKSHEET.emptyState}
                className="py-16 text-center"
              >
                <p className="text-sm font-medium text-slate-700">
                  No work items yet
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Add a row to start logging work.
                </p>
              </td>
            </TableRow>
          ) : (
            <>
              {topSpacerHeight > 0 && (
                <TableRow aria-hidden="true">
                  <td
                    colSpan={totalCols}
                    style={{ height: topSpacerHeight, padding: 0 }}
                  />
                </TableRow>
              )}

              {visibleItems.map((item, localIndex) => {
                const index = visibleStart + localIndex + 1;

                return (
                  <WorkSheetRow
                    key={item.id}
                    activeCell={activeCell}
                    selection={selection}
                    rangeSelection={rangeSelection}
                    totalRows={sortedTableItems.length}
                    onExtendSelection={handleExtendSelection}
                    onCheckboxRangeSelect={handleCheckboxRangeSelect}
                    fillState={fillState}
                    onCellSelect={handleCellSelect}
                    onFillStart={handleFillStart}
                    onFillHover={handleFillHover}
                    onFillEnd={handleFillEnd}
                    item={item}
                    index={index}
                    currentUser={currentUser}
                    users={users}
                    usersById={usersById}
                    nonAdminUsers={nonAdminUsers}
                    reviewerUsers={reviewerUsers}
                    options={options}
                    clients={clients}
                    projects={projects}
                    deliverablesByProject={deliverablesByProject}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                    hiddenColumns={hiddenColumns}
                    columnOrder={columnOrder}
                    onRowDragStart={(event, rowId) => {
                      event.dataTransfer.effectAllowed = "move";
                      setDraggedRow(rowId);
                    }}
                    onRowDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onRowDrop={(event, rowId) => {
                      event.preventDefault();
                      handleRowDrop(rowId);
                    }}
                    onRowDragEnd={() => setDraggedRow(null)}
                    isRowDragging={draggedRow === item.id}
                    canDragRow={!columnSort.key}
                    selected={selectedSet.has(item.id)}
                    onToggleSelect={(id) => handleCheckboxToggle(id, index)}
                    displayRowNumber={displayRowNumberById[item.id]}
                    hiddenRowIdsBefore={hiddenRowsBeforeById[item.id] || []}
                    hiddenRowIdsAfter={
                      item.id === sortedTableItems[sortedTableItems.length - 1]?.id
                        ? hiddenRowsBeforeById.__trailing__ || []
                        : []
                    }
                    onUnhideRows={restoreHiddenRows}
                    onHideRow={(rowId) => {
                      setHiddenRows((current) =>
                        current.includes(rowId)
                          ? current
                          : [...current, rowId]
                      );

                      if (selectedSet.has(rowId)) {
                        onToggleSelect(rowId);
                      }
                    }}
                  />
                );
              })}

              {bottomSpacerHeight > 0 && (
                <TableRow aria-hidden="true">
                  <td
                    colSpan={totalCols}
                    style={{ height: bottomSpacerHeight, padding: 0 }}
                  />
                </TableRow>
              )}
            </>
          )}
        </TableBody>
      </Table>
    </div>
  );
});