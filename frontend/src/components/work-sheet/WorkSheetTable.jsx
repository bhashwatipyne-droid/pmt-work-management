import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { FilterMultiSelect } from "./FilterMultiSelect";
import { buildGridTemplateColumns } from "@/constants/worksheetColumnWidths";
import { computeFrozenLefts } from "@/lib/worksheetFreeze";
import { Table } from "../ui/table";
import { useWorksheetTableWindow } from "./useWorksheetTableWindow";
import { useWorksheetTableRows } from "./useWorksheetTableRows";
import { useWorksheetTableGroups } from "./useWorksheetTableGroups";
import { useWorksheetTableLookups } from "./useWorksheetTableLookups";
import { WorkSheetTableBody } from "./WorkSheetTableBody";
import { WorkSheetTableHeader } from "./WorkSheetTableHeader";
import { readSessionState, writeSessionState } from "@/hooks/useSessionState";
import { focusCellShell, focusCheckboxRow } from "./useWorksheetKeyboardNavigation";
import { WorksheetFormulaBar } from "./WorksheetFormulaBar";
import { QuantityPanel } from "./QuantityPanel";
import { RangeSelectionBar } from "./RangeSelectionBar";
import { isQtySet } from "@/lib/quantity";
import { WORKSHEET } from "@/constants/testIds";
import { toast } from "sonner";
import { canEditWorkItem, isRowLockedForMember } from "@/lib/worksheetPermissions";
import { trackEvent } from "@/analytics";
import { useWorksheetRangeSelection } from "@/hooks/useWorksheetRangeSelection";
import { useWorksheetTableDragging } from "@/hooks/useWorksheetTableDragging";
import { resolvePasteValue as resolvePasteValueFor } from "@/lib/worksheetPaste";
import { computeRangeStats } from "@/lib/worksheetRangeStats";
import { COLUMNS, COLUMN_FIELDS, FORMULA_EDITABLE_FIELDS, FORMULA_PICKER_COLUMNS, MEMBER_STAGE_BY_DEPARTMENT, MIN_HEADER_HEIGHT, SHEET_EXCLUDED_COLUMNS, excludedColumnsFor } from "./workSheetTableConfig";
export { SHEET_EXCLUDED_COLUMNS, excludedColumnsFor };

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
  onDuplicateRow,
  onFill,
  // Collaborators. `collabIndex` maps a collab_group_id to the creator ids on
  // that entry across EVERY row (not just the ones the filters show);
  // onAddCollaborators(rowIds, creatorIds) tags people on entries.
  collabIndex,
  onAddCollaborators,
  // Lets the page's Ctrl/Cmd+Z undo a drag-reorder: (label, undoFn) => void.
  onUndoable,
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
  onRequestHideRow,
  // New: "Stage" | "Member" | "None" (default). Owned by the page (same
  // way `filters` is), scoped per-tab. Everything below degrades to the
  // existing flat list when this is "None"/omitted.
  groupBy = "None",
  // Fires whenever "are all current groups collapsed" changes, so the
  // toolbar's Collapse all/Expand all button can show the right label
  // without this table having to lift its whole collapsed-set upward.
  onGroupCollapseStateChange,
}, ref) {
  const [activeCell, setActiveCell] = useState(null);
  const [selection, setSelection] = useState(null);
  const [rangeSelection, setRangeSelection] = useState(null);
  const rangeSelectionRef = useRef(null);
  const activeCellRef = useRef(null);
  // The row whose Qty side panel is open, and the cell to return focus to.
  const [qtyPanel, setQtyPanel] = useState(null);
  const qtyPanelRef = useRef(null);
  qtyPanelRef.current = qtyPanel;
  // Left edge for the cell-count bar, so it sits just right of the sidebar.
  const [rangeBarLeft, setRangeBarLeft] = useState(16);
  const rangeDragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const checkboxAnchorRef = useRef(null);
  const [columnSort, setColumnSort] = useState({
    key: null,
    direction: "asc",
  });

  const [hiddenColumns, setHiddenColumns] = useState(() => {
    try {
      const saved = localStorage.getItem("worksheet_hidden_columns");
      // "Duration (min)" was renamed "Duration" when it moved to seconds.
      return saved
        ? JSON.parse(saved).map((c) => (c === "Duration (min)" ? "Duration" : c))
        : [];
    } catch {
      return [];
    }
  });
  // Frozen columns: this column and every one before it stay in place while
  // the sheet scrolls sideways (like "Freeze up to column" in a spreadsheet).
  const [frozenThrough, setFrozenThrough] = useState(() => {
    try {
      return localStorage.getItem("worksheet_frozen_column") || null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (frozenThrough) localStorage.setItem("worksheet_frozen_column", frozenThrough);
      else localStorage.removeItem("worksheet_frozen_column");
    } catch {
      // private mode: the freeze just lasts for this visit
    }
  }, [frozenThrough]);
  // Columns whose text wraps onto several lines instead of being clipped with
  // an ellipsis. Remembered per person, like column order and widths.
  const wrappedColumnsKey = `worksheet_wrapped_columns_${currentUser.id}`;
  const [wrappedColumns, setWrappedColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(wrappedColumnsKey) || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(wrappedColumnsKey, JSON.stringify(wrappedColumns));
    } catch {
      // private mode: wrapping just lasts for this visit
    }
  }, [wrappedColumns, wrappedColumnsKey]);
  const toggleColumnWrap = useCallback(
    (column) =>
      setWrappedColumns((current) =>
        current.includes(column) ? current.filter((c) => c !== column) : [...current, column]
      ),
    []
  );
  const excludedColumns = excludedColumnsFor(sheetKey);
  // What is actually hidden on this tab: the person's own hidden columns plus
  // the ones this tab doesn't use.
  const effectiveHiddenColumns = useMemo(
    () =>
      excludedColumns.length
        ? [...hiddenColumns, ...excludedColumns]
        : hiddenColumns,
    [hiddenColumns, excludedColumns]
  );
  const columnOrderKey = `worksheet_column_order_${currentUser.id}`;
  const rowOrderKey = `worksheet_row_order_${currentUser.id}_${sheetKey}`;

  const [columnOrder, setColumnOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`worksheet_column_order_${currentUser.id}`) || "null");
      if (!Array.isArray(saved)) return COLUMNS;
      const order = saved.filter((column) => COLUMNS.includes(column));
      // A column added after this order was saved (Qty, Duration) goes right
      // after the column that precedes it by default, not at the far end.
      COLUMNS.forEach((column, index) => {
        if (order.includes(column)) return;
        const before = COLUMNS.slice(0, index)
          .reverse()
          .find((name) => order.includes(name));
        order.splice(before ? order.indexOf(before) + 1 : 0, 0, column);
      });
      return order;
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
  const rowOrderRef = useRef(rowOrder);
  rowOrderRef.current = rowOrder;
  const columnOrderRef = useRef(columnOrder);
  columnOrderRef.current = columnOrder;
  const [draggedColumn, setDraggedColumn] = useState(null);
  const [draggedRow, setDraggedRow] = useState(null);
  // Every row being carried by the current row drag: just the dragged row, or
  // all the selected rows when a selected row is the one picked up.
  const [draggedRowIds, setDraggedRowIds] = useState([]);
  const [dropTarget, setDropTarget] = useState(null); // { id, pos: "before" | "after" }
  const checkboxDragRef = useRef(null);
  const columnWidthsKey = `worksheet_column_widths_${currentUser.id}`;

  const [columnWidths, setColumnWidths] = useState(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(
          `worksheet_column_widths_${currentUser.id}`
        ) || "null"
      );

      return saved && typeof saved === "object" ? saved : {};
    } catch {
      return {};
    }
  });

  const [resizingColumn, setResizingColumn] = useState(null);
  const resizeStateRef = useRef(null);
  const rowOrderScopeRef = useRef(rowOrderKey);
  const [fillState, setFillState] = useState(null);
  const [isFilling, setIsFilling] = useState(false);

  const groupBySafe = groupBy && groupBy !== "None" ? groupBy : null;

  // Which group keys are currently collapsed. Not persisted to
  // localStorage — but every group starts collapsed on a fresh mount
  // (a new session, or the first load of the day), which amounts to the
  // same thing: nothing is ever remembered across a reload, it's just
  // collapsed instead of expanded by default. See the effect below,
  // once visibleTableItems/resolveGroupKey exist, for what populates it.
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState(() => new Set());
  const groupInfoRef = useRef(null);
  // Which groups the person opened, remembered for this browser tab per sheet
  // and grouping, so leaving the tab (e.g. to Management) and coming back finds
  // them as they were left. Groups still start collapsed when nothing is
  // remembered (that keeps the first render light).
  const expandedScope = `worksheet-expanded:${sheetKey}:${groupBy && groupBy !== "None" ? groupBy : "none"}`;
  const expandedScopeRef = useRef(expandedScope);
  expandedScopeRef.current = expandedScope;
  const rememberExpanded = (mutate) => {
    const open = new Set(readSessionState(expandedScopeRef.current, []));
    mutate(open);
    writeSessionState(expandedScopeRef.current, [...open]);
  };

  const scrollRef = useRef(null);
  const fillStateRef = useRef(null);
  const itemsRef = useRef(items);
  const sortedItemsRef = useRef(items);
  const onFillRef = useRef(onFill);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(MIN_HEADER_HEIGHT);

  // Measured height of each row that has been on screen, by item id.
  const rowHeightsRef = useRef(new Map());
  const [heightVersion, setHeightVersion] = useState(0);
  const heightFrameRef = useRef(null);
  const [rowObserver] = useState(() => {
    if (typeof ResizeObserver === "undefined") return null;

    return new ResizeObserver((entries) => {
      let changed = false;

      for (const entry of entries) {
        const id = entry.target.dataset.rowId;
        if (!id) continue;
        const height = Math.round(
          entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight
        );
        if (height > 0 && rowHeightsRef.current.get(id) !== height) {
          rowHeightsRef.current.set(id, height);
          changed = true;
        }
      }

      // One re-position per frame however many rows resized.
      if (changed && heightFrameRef.current == null) {
        heightFrameRef.current = requestAnimationFrame(() => {
          heightFrameRef.current = null;
          setHeightVersion((version) => version + 1);
        });
      }
    });
  });

  useEffect(
    () => () => {
      rowObserver?.disconnect();
      if (heightFrameRef.current != null) {
        cancelAnimationFrame(heightFrameRef.current);
      }
    },
    [rowObserver]
  );

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
    // Used by "Insert row above/below" in the bulk action bar. Places a
    // newly-created row's id into the same manual drag order that
    // right-click-drag already maintains (rowOrder), immediately next to
    // an anchor row, rather than introducing a second, separate notion of
    // row position.
    insertRowNear: (newItemId, anchorItemId, position) => {
      setRowOrder((current) => {
        const base = current.length
          ? [...current]
          : sortedItemsRef.current.map((item) => item.id);
        const withoutNew = base.filter((id) => id !== newItemId);
        const anchorIndex = withoutNew.indexOf(anchorItemId);

        if (anchorIndex === -1) {
          // Anchor row isn't in the order we know about (e.g. it was
          // filtered/hidden between selection and now) — fall back to the
          // front, matching how a brand-new row normally surfaces.
          return [newItemId, ...withoutNew];
        }

        const insertAt = position === "below" ? anchorIndex + 1 : anchorIndex;
        const next = [...withoutNew];
        next.splice(insertAt, 0, newItemId);
        return next;
      });
    },
    // Backs the toolbar's "Collapse all"/"Expand all" control. Reads the
    // live group list off a ref (see the sync effect below) rather than
    // closing over `groupInfo` directly, since this handle object is
    // built once — same pattern already used above for sortedItemsRef.
    collapseAllGroups: () => {
      const info = groupInfoRef.current;
      if (!info) return;
      rememberExpanded((open) => info.order.forEach((key) => open.delete(key)));
      setCollapsedGroupKeys(new Set(info.order));
    },
    expandAllGroups: () => {
      const info = groupInfoRef.current;
      if (info) rememberExpanded((open) => info.order.forEach((key) => open.add(key)));
      setCollapsedGroupKeys(new Set());
    },
  }), []);

  useEffect(() => {
    localStorage.setItem(columnOrderKey, JSON.stringify(columnOrder));
  }, [columnOrder, columnOrderKey]);

  useEffect(() => {
    localStorage.setItem(
      columnWidthsKey,
      JSON.stringify(columnWidths)
    );
  }, [columnWidths, columnWidthsKey]);

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

  const {
    deliverablesByProject,
    clientNameOf,
    projectLookalikes,
    recentProjectsByCreator,
    usersById,
    nonAdminUsers,
    reviewerUsers,
    getCollabMemberIds,
    clientFilterValues,
    projectFilterValues,
    deliverableFilterValues,
    stageFilterValues,
    typeFilterValues,
    categoryFilterValues,
    statusFilterValues,
    creatorFilterValues,
    reviewerFilterValues,
  } = useWorksheetTableLookups({ items, users, options, projects, deliverables, clients, collabIndex });

  // Maps a column to its filter field(s) in the `filters` object. Columns
  // not listed here (Deliverable Name, Deliverable Link, Version,
  // Time (min), Remarks) have no filter — their column menu only offers
  // Sort and Hide.
  const COLUMN_FILTER_KEYS = {
    Client: "client_ids",
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
    Client: clientFilterValues,
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

      trackEvent("filter_applied", {
        filter_type: key,
        filter_value: Array.isArray(value) ? value : String(value ?? ""),
      });
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

  const {
    getSortValue,
    visibleTableItems,
    hiddenRowsBeforeById,
    displayRowNumberById,
  } = useWorksheetTableRows({ items, projects, clients, deliverables, usersById, columnSort, rowOrder, hiddenRows });

  const {
    resolveGroupKey,
    groupInfo,
    sortedTableItems,
    displayEntries,
  } = useWorksheetTableGroups({ visibleTableItems, groupBySafe, usersById, collapsedGroupKeys });

  // Groups start collapsed — on first mount (a fresh session/page load)
  // and whenever the grouping mode or active tab changes, since keys
  // collapsed under a different mode/tab wouldn't mean anything here.
  // This also matters for performance: with thousands of rows, starting
  // expanded meant the very first render had to build render entries for
  // every row instead of just the handful of group headers.
  useEffect(() => {
    const open = new Set(readSessionState(expandedScopeRef.current, []));
    setCollapsedGroupKeys(
      groupInfo ? new Set(groupInfo.order.filter((key) => !open.has(key))) : new Set()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBySafe, sheetKey]);

  useEffect(() => {
    groupInfoRef.current = groupInfo;
  }, [groupInfo]);

  useEffect(() => {
    if (!onGroupCollapseStateChange) return;

    const allCollapsed = Boolean(
      groupInfo?.order.length && groupInfo.order.every((key) => collapsedGroupKeys.has(key))
    );

    onGroupCollapseStateChange(allCollapsed);
  }, [groupInfo, collapsedGroupKeys, onGroupCollapseStateChange]);

  const toggleGroupCollapse = useCallback((key) => {
    setCollapsedGroupKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
        rememberExpanded((open) => open.add(key));
      } else {
        next.add(key);
        rememberExpanded((open) => open.delete(key));
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    if (!current || current.targetRow === current.sourceRow) return;

    // sourceCol is a position among the VISIBLE columns.
    const sourceColumn = columnOrder.filter((column) => !effectiveHiddenColumns.includes(column))[
      current.sourceCol
    ];
    const field = COLUMN_FIELDS[sourceColumn];
    const currentItems = sortedItemsRef.current;
    const sourceItem = currentItems[current.sourceRow - 1];

    if (!field || !sourceItem) return;

    const value = sourceItem[field];
    // Up or down from the source row: every row the drag passed over.
    const from = Math.min(current.sourceRow, current.targetRow);
    const to = Math.max(current.sourceRow, current.targetRow);
    const targetIds = currentItems
      .slice(from - 1, to)
      .filter((item) => item.id !== sourceItem.id)
      .map((item) => item.id);

    if (!targetIds.length) return;

    const shown = String(getSortValue(sourceItem, sourceColumn) ?? "");
    const announce = () =>
      toast.success(
        `Filled ${targetIds.length} ${targetIds.length === 1 ? "cell" : "cells"} with “${shown || "empty"}”`
      );

    try {
      // A "Not available" source has no deliverable_id to copy, so copy the
      // flag itself (the backend clears deliverable_id and skips rows that
      // have no project).
      if (field === "deliverable_id" && sourceItem.deliverable_not_available) {
        await onFillRef.current(targetIds, "deliverable_not_available", true);
        announce();
        return;
      }

      await onFillRef.current(targetIds, field, value);
      announce();
    } catch {
      // onFill is responsible for displaying the persistence error.
    }
  }, [columnOrder, effectiveHiddenColumns, getSortValue]);

  // Global pointer tracking while a fill drag is active.
  useEffect(() => {
    if (!isFilling) return undefined;

    const pointer = { x: 0, y: 0 };
    let frame = null;

    const hoverUnderPointer = () => {
      const element = document.elementFromPoint(pointer.x, pointer.y);
      const cell = element?.closest("[data-sheet-cell]");
      if (!cell) return;

      const row = Number(cell.getAttribute("data-sheet-row"));
      if (Number.isNaN(row)) return;

      handleFillHover(row);
    };

    // The sheet only mounts the rows on screen, so dragging towards an edge
    // scrolls it (up as well as down) to reach rows beyond the window.
    const autoScroll = () => {
      frame = null;
      const scroller = scrollRef.current;
      if (!scroller) return;
      const rect = scroller.getBoundingClientRect();
      const edge = 48;
      let dy = 0;
      if (pointer.y > rect.bottom - edge) dy = Math.min(28, (pointer.y - (rect.bottom - edge)) / 2 + 4);
      else if (pointer.y < rect.top + headerHeight + edge / 2) dy = -Math.min(28, (rect.top + headerHeight + edge / 2 - pointer.y) / 2 + 4);
      if (!dy) return;
      scroller.scrollBy(0, dy);
      hoverUnderPointer();
      frame = requestAnimationFrame(autoScroll);
    };

    const handlePointerMove = (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      hoverUnderPointer();
      if (frame == null) frame = requestAnimationFrame(autoScroll);
    };

    const handlePointerUp = () => {
      handleFillEnd();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isFilling, handleFillHover, handleFillEnd, headerHeight]);

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

  // The header is frozen at the top while the rows scroll under it, and it can
  // be taller than one line when a column title wraps.
  useEffect(() => {
    const element = headerRef.current;
    if (!element) return undefined;

    const update = () =>
      setHeaderHeight(Math.max(MIN_HEADER_HEIGHT, Math.round(element.offsetHeight)));

    update();
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const {
    visibleItems,
    topSpacerHeight,
    bottomSpacerHeight,
  } = useWorksheetTableWindow({ displayEntries, rowHeightsRef, heightVersion, scrollTop, headerHeight, viewportHeight });

  const allVisibleIds = useMemo(
    () => sortedTableItems.map((item) => item.id),
    [sortedTableItems]
  );

  const allSelected =
    allVisibleIds.length > 0 &&
    allVisibleIds.every((id) => selectedSet.has(id));

  const visibleColumns = columnOrder.filter((column) => !effectiveHiddenColumns.includes(column));

  // Where each frozen column sticks: just right of the gutter and of the frozen
  // columns before it. null when nothing is frozen (or the frozen part would
  // fill most of the screen, which would leave nothing to scroll).
  const frozenLefts = useMemo(
    () => computeFrozenLefts(visibleColumns, frozenThrough, columnWidths),
    // visibleColumns is rebuilt on every render; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleColumns.join("|"), frozenThrough, columnWidths]
  );

  const isMember = currentUser.role === "member";
  const memberStage = MEMBER_STAGE_BY_DEPARTMENT[currentUser.department];

  const canEditItem = useCallback(
    (item) =>
      isMember
        ? (!item.stage || item.stage === memberStage) &&
          !isRowLockedForMember(currentUser, item, users)
        : canEditWorkItem(currentUser, item, users),
    [isMember, memberStage, currentUser, users]
  );

  // Turns pasted display text back into the raw field(s) to save for a
  // column, resolved against the target row's own current context (e.g.
  // "Project" is matched only within the target's client). Returns null
  // when the text doesn't match anything valid for that column, so the
  // caller can skip that cell rather than write garbage.
  const resolvePasteValue = useCallback(
    (column, rawText, targetItem) =>
      resolvePasteValueFor(
        { clients, projects, deliverablesByProject, options, nonAdminUsers, reviewerUsers },
        column,
        rawText,
        targetItem
      ),
    [clients, projects, deliverablesByProject, options, nonAdminUsers, reviewerUsers]
  );

  // Copies a block of cells (1-based rows, 0-based visible columns) as
  // tab/newline-separated text, so it pastes cleanly into Sheets/Excel.
  const copyBlock = useCallback(
    (startRow, endRow, startCol, endCol) => {
      if (!navigator.clipboard) {
        toast.error(
          "Clipboard access isn't available here (needs HTTPS or a supported browser)"
        );
        return;
      }

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

          trackEvent("copy_paste_used", {
            action: "copy",
            cell_count: count,
          });

          toast.success(count > 1 ? `Copied ${count} cells` : "Copied");
        })
        .catch(() => {
          toast.error("Couldn't copy — clipboard access was blocked");
        });
    },
    [visibleColumns, getSortValue]
  );

  const { clearRangeSelection, handleSheetPointerDownCapture, handleSheetClickCapture } =
    useWorksheetRangeSelection({
      activeCellRef,
      canEditItem,
      copyBlock,
      headerHeight,
      onUpdate,
      qtyPanelRef,
      rangeDragRef,
      rangeSelectionRef,
      resolvePasteValue,
      scrollRef,
      setRangeSelection,
      sortedItemsRef,
      suppressClickRef,
      visibleColumns,
    });

  // What the cell-count bar shows. Worked out from the data, not the page, so
  // rows scrolled out of view (the sheet only mounts the visible ones) count.
  const rangeStats = useMemo(
    () =>
      computeRangeStats({
        rangeSelection,
        sortedTableItems,
        visibleColumns,
        getSortValue,
        statusOrder: options.statuses || [],
      }),
    [rangeSelection, sortedTableItems, visibleColumns, getSortValue, options.statuses]
  );

  // Keep the bar just right of the sidebar, even when the sidebar collapses.
  const hasRangeStats = Boolean(rangeStats);
  useEffect(() => {
    if (!hasRangeStats) return undefined;
    const element = scrollRef.current;
    if (!element) return undefined;

    const update = () => setRangeBarLeft(Math.round(element.getBoundingClientRect().left) + 16);
    update();

    window.addEventListener("resize", update);
    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(element);
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [hasRangeStats]);

  // ----- Qty side panel ---------------------------------------------------
  const openQtyPanel = useCallback((id) => {
    const active = activeCellRef.current;
    setQtyPanel({ id, restore: active ? { row: active.row, col: active.col } : null });
  }, []);

  const closeQtyPanel = useCallback(() => {
    const restore = qtyPanelRef.current?.restore;
    setQtyPanel(null);
    if (restore) requestAnimationFrame(() => focusCellShell(restore.row, restore.col));
  }, []);

  const qtyPanelItem = qtyPanel ? items.find((entry) => entry.id === qtyPanel.id) : null;

  // The panel goes away with its row (deleted, or no longer a Qty row).
  useEffect(() => {
    if (qtyPanel && (!qtyPanelItem || !isQtySet(qtyPanelItem))) setQtyPanel(null);
  }, [qtyPanel, qtyPanelItem]);

  // ----- Formula bar ------------------------------------------------------
  const formulaItem = activeCell ? sortedTableItems[activeCell.row - 1] : null;
  const formulaColumn = activeCell ? visibleColumns[activeCell.col] : null;
  const formulaField = formulaColumn ? FORMULA_EDITABLE_FIELDS[formulaColumn] : null;
  const formulaEditable = Boolean(formulaItem && formulaField && canEditItem(formulaItem));
  const formulaValue =
    formulaItem && formulaColumn ? String(getSortValue(formulaItem, formulaColumn) ?? "") : "";
  const formulaLabel =
    formulaItem && formulaColumn
      ? `Row ${displayRowNumberById[formulaItem.id] ?? activeCell.row} \u00b7 ${formulaColumn}`
      : null;
  const formulaPlaceholder = !formulaColumn
    ? "Select a cell to see its value"
    : formulaEditable
      ? "Empty"
      : FORMULA_PICKER_COLUMNS.has(formulaColumn)
        ? "Press Enter to pick from the list"
        : "";

  const handleFormulaCommit = (text) => {
    if (!formulaItem || !formulaField) return;
    const next = formulaField === "deliverable_name" ? text.replace(/\s*[\r\n]+\s*/g, " ") : text;
    if (String(formulaItem[formulaField] ?? "") === next) return;
    onUpdate(formulaItem.id, { [formulaField]: next });
  };

  // Hand focus back to the sheet after the bar is done, moving like Excel:
  // Enter goes down, Tab goes right (Shift reverses), Esc stays put.
  const handleFormulaFinish = (move) => {
    if (!activeCell) return;
    const { row, col } = activeCell;
    const attempts =
      move === "down"
        ? [[row + 1, col]]
        : move === "up"
          ? [[row - 1, col]]
          : move === "right"
            ? [[row, col + 1]]
            : move === "left"
              ? [[row, col - 1]]
              : [];
    for (const [r, c] of attempts) {
      if (focusCellShell(r, c)) return;
    }
    focusCellShell(row, col);
  };

  const gridTemplateColumns = buildGridTemplateColumns(
    visibleColumns,
    columnWidths
  );

  const totalCols = COLUMNS.length + 2; // #, checkbox

  const {
    handleColumnResizeStart,
    handleColumnDrop,
    handleRowDragStart,
    clearRowDrag,
    handleRowDragOver,
    handleRowDrop,
    handleCheckboxDragStart,
    handleCheckboxDragEnter,
    handleCheckboxClickCapture,
  } = useWorksheetTableDragging({
    canEditItem,
    checkboxAnchorRef,
    checkboxDragRef,
    columnOrderRef,
    columnSort,
    draggedColumn,
    draggedRow,
    draggedRowIds,
    groupBySafe,
    onSelectRange,
    onUndoable,
    rangeSelectionRef,
    resizeStateRef,
    resolveGroupKey,
    rowOrderRef,
    selectedIds,
    selectedSet,
    setActiveCell,
    setColumnOrder,
    setColumnWidths,
    setDraggedColumn,
    setDraggedRow,
    setDraggedRowIds,
    setDropTarget,
    setRangeSelection,
    setResizingColumn,
    setRowOrder,
    setSelection,
    sortedItemsRef,
  });

  const getHiddenColumnsAfter = (columnIndex) => {
    const hidden = [];

    for (let i = columnIndex + 1; i < columnOrder.length; i += 1) {
      // A column this tab doesn't use is not "hidden by the person": step over it.
      if (excludedColumns.includes(columnOrder[i])) continue;
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
      if (excludedColumns.includes(column)) continue;
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
      case "Client":
        return Boolean(filters?.client_ids?.length);
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

  const ctx = {
    activeCell,
    allSelected,
    allVisibleIds,
    bottomSpacerHeight,
    clearColumnFilter,
    clearRowDrag,
    clientNameOf,
    clients,
    collabIndex,
    columnOrder,
    columnSort,
    columnWidths,
    currentUser,
    deliverablesByProject,
    displayEntries,
    displayRowNumberById,
    draggedColumn,
    draggedRowIds,
    dropTarget,
    effectiveHiddenColumns,
    fillState,
    frozenLefts,
    frozenThrough,
    wrappedColumns,
    toggleColumnWrap,
    getCollabMemberIds,
    getHiddenColumnsAfter,
    getHiddenColumnsFromStart,
    gridTemplateColumns,
    groupBySafe,
    handleCellSelect,
    handleCheckboxClickCapture,
    handleCheckboxDragEnter,
    handleCheckboxDragStart,
    handleCheckboxRangeSelect,
    handleCheckboxToggle,
    handleColumnDrop,
    handleColumnResizeStart,
    handleExtendSelection,
    handleFillEnd,
    handleFillHover,
    handleFillStart,
    handleRowDragOver,
    handleRowDragStart,
    handleRowDrop,
    headerRef,
    hiddenRowsBeforeById,
    isColumnFiltered,
    nonAdminUsers,
    onAddCollaborators,
    onDelete,
    onDuplicateRow,
    onRequestHideRow,
    onToggleSelectAll,
    onUpdate,
    openQtyPanel,
    options,
    projectLookalikes,
    projects,
    qtyPanel,
    rangeSelection,
    recentProjectsByCreator,
    renderColumnFilterControl,
    restoreHiddenColumns,
    restoreHiddenRows,
    reviewerUsers,
    rowObserver,
    selectedSet,
    selection,
    setColumnSort,
    setDraggedColumn,
    setFrozenThrough,
    setHiddenColumns,
    sortedTableItems,
    toggleGroupCollapse,
    topSpacerHeight,
    totalCols,
    users,
    usersById,
    visibleColumns,
    visibleItems,
  };

  return (
    <>
    <WorksheetFormulaBar
      label={formulaLabel}
      value={formulaValue}
      activeRow={activeCell?.row ?? null}
      activeCol={activeCell?.col ?? null}
      editable={formulaEditable}
      placeholder={formulaPlaceholder}
      onCommit={handleFormulaCommit}
      onFinish={handleFormulaFinish}
    />
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      onPointerDownCapture={handleSheetPointerDownCapture}
      onClickCapture={handleSheetClickCapture}
      // Moving focus to a cell scrolls it into view; without this it could
      // stop underneath the frozen header.
      style={{ scrollPaddingTop: headerHeight + 8 }}
      className="flex-1 min-h-0 overflow-auto bg-white sheet-mode [&>div]:!w-max [&>div]:!overflow-visible"
    >
      <Table
        data-testid={WORKSHEET.table}
        className="min-w-max border-collapse"
      >
        <WorkSheetTableHeader {...ctx} />

        <WorkSheetTableBody {...ctx} />
      </Table>
    </div>

    {qtyPanelItem && (
      <QuantityPanel
        key={qtyPanelItem.id}
        item={qtyPanelItem}
        options={options}
        deliverables={deliverablesByProject[qtyPanelItem.project_id] || []}
        canEdit={canEditItem(qtyPanelItem)}
        onUpdate={onUpdate}
        onClose={closeQtyPanel}
      />
    )}

    {rangeStats && (
      <RangeSelectionBar
        stats={rangeStats}
        left={rangeBarLeft}
        onCopy={() =>
          copyBlock(
            rangeStats.block.r1,
            rangeStats.block.r2,
            rangeStats.block.c1,
            rangeStats.block.c2
          )
        }
        onClear={clearRangeSelection}
      />
    )}
    </>
  );
});