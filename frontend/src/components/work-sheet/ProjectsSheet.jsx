import { cloneElement, useMemo, useRef, useState } from "react";
import { renderHeaderCell } from "@/components/work-sheet/projects-sheet/renderHeaderCell";

import { renderSheetCell } from "@/components/work-sheet/projects-sheet/renderSheetCell";
import { getSheetCache, prefetchProjectSheet } from "@/components/work-sheet/projects-sheet/sheetStore";
import { SheetDialogs } from "@/components/work-sheet/projects-sheet/sections/SheetDialogs";
import { SheetRangeBar } from "@/components/work-sheet/projects-sheet/sections/SheetRangeBar";
import { SheetBulkBar } from "@/components/work-sheet/projects-sheet/sections/SheetBulkBar";
import { GridEmpty } from "@/components/work-sheet/projects-sheet/sections/GridEmpty";
import { GridGroups } from "@/components/work-sheet/projects-sheet/sections/GridGroups";
import { GridSkeleton } from "@/components/work-sheet/projects-sheet/sections/GridSkeleton";
import { GridHeaderRow } from "@/components/work-sheet/projects-sheet/sections/GridHeaderRow";
import { SheetFormula } from "@/components/work-sheet/projects-sheet/sections/SheetFormula";
import { SheetFilterChips } from "@/components/work-sheet/projects-sheet/sections/SheetFilterChips";
import { SheetToolbar } from "@/components/work-sheet/projects-sheet/sections/SheetToolbar";
import { SheetTitleRow } from "@/components/work-sheet/projects-sheet/sections/SheetTitleRow";
import { useSheetMonth } from "@/components/work-sheet/projects-sheet/useSheetMonth";
import { useSheetData } from "@/components/work-sheet/projects-sheet/useSheetData";
import { useSheetView } from "@/components/work-sheet/projects-sheet/useSheetView";
import { useSheetSave } from "@/components/work-sheet/projects-sheet/useSheetSave";
import { useSheetDrop } from "@/components/work-sheet/projects-sheet/useSheetDrop";
import { useSheetClipboard } from "@/components/work-sheet/projects-sheet/useSheetClipboard";
import { useSheetEditing } from "@/components/work-sheet/projects-sheet/useSheetEditing";
import { useSheetRows } from "@/components/work-sheet/projects-sheet/useSheetRows";
import { useSheetFilters } from "@/components/work-sheet/projects-sheet/useSheetFilters";
import { hasSessionState, useSessionState } from "@/hooks/useSessionState";
import { C } from "./projects-sheet/sheetTheme";
import { COLS, COL_BY_KEY } from "./projects-sheet/sheetColumns";
import { addDays } from "./projects-sheet/sheetDates";

// Work Sheet > Management tab: the Projects team's follow-up sheet.
//
// Drawn exactly like the redesign's Management sheet: a day stepper, the same
// grid as the other sheets (frozen ID + Task columns, formula bar, grouped by
// member, a cell is selected with a click and edited with Enter, a double
// click or by typing).
//
// A task is one row that stays open until it is marked Done, so the list for a
// day is every task open on that day - nobody copies yesterday's rows forward.
// What happened on a day goes in that day's Remark (its update note); days
// late are counted from the follow-up dates instead of being typed.
//
// Not production work: none of this counts toward efficiency.

export { prefetchProjectSheet };

export function ProjectsSheet({ currentUser, users = [], clients: clientsProp, tabs }) {
  const [tasks, setTasks] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [options, setOptions] = useState({ task_types: [], statuses: [], teams: [], meeting_types: [] });
  const [fetchedClients, setClients] = useState([]);
  const clients = clientsProp?.length ? clientsProp : fetchedClients;
  const [today, setToday] = useState(() => addDays(new Date().toISOString().slice(0, 10), 0));
  // The view (search, filters, grouping, which groups are open, sort, columns)
  // is remembered for the browser tab, so switching to another Work sheet tab
  // and back finds the sheet as it was left.
  const [month, setMonth] = useSessionState("mgmt-month", null); // "2026-10"; null = this month
  const [pickedDay, setPickedDay] = useState(null); // null = the month's default day
  // The sheet always shows the whole month (no day stepper).
  const allDays = true;
  const [query, setQuery] = useSessionState("mgmt-query", "");
  const [groupBy, setGroupBy] = useSessionState("mgmt-group-by", "owner");
  const [collapsed, setCollapsed] = useSessionState("mgmt-collapsed", {});
  // On load the member groups start collapsed, so an admin sees the roll-up
  // (who has how many tasks) first and opens the ones they want.
  const didCollapseOnLoad = useRef(hasSessionState("mgmt-collapsed"));
  const [filters, setFilters] = useSessionState("mgmt-filters", {});
  const [sort, setSort] = useSessionState("mgmt-sort", null); // { key, dir }
  const [loading, setLoading] = useState(!getSheetCache());
  const [cell, setCell] = useState(null); // { r: taskId, c: colKey }
  const [editing, setEditing] = useState(null); // { r, c, draft }
  const [menu, setMenu] = useState(null); // { r, c, kind: "pick" | "expand" }
  const [headMenu, setHeadMenu] = useState(null); // column key
  const [filterMenu, setFilterMenu] = useState(null); // null | "fields" | field key
  const [sel, setSel] = useState({});
  const [order, setOrder] = useSessionState("mgmt-col-order", () => COLS.map((c) => c.key));
  const [hiddenCols, setHiddenCols] = useSessionState("mgmt-hidden-cols", []);
  const [frozenThrough, setFrozenThrough] = useSessionState("mgmt-frozen", null); // nothing frozen until asked
  const [hiddenRows, setHiddenRows] = useState({});
  const [ranges, setRanges] = useSessionState("mgmt-ranges", {}); // date column key -> { from, to } (YYYY-MM-DD)
  const [dragCol, setDragCol] = useState(null);
  const [widths, setWidths] = useSessionState("mgmt-widths", {}); // column key -> px, after a drag-resize

  // Drag a header's right edge to resize that column.
  const startResize = (e, key, from) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const onMove = (ev) => setWidths((w) => ({ ...w, [key]: Math.max(60, Math.round(from + ev.clientX - x0)) }));
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
    };
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Visible columns in order; the frozen ones (up to frozenThrough) get their
  // sticky left offsets, and the last frozen one draws the thicker edge.
  const cols = useMemo(() => {
    const list = order.filter((k) => !hiddenCols.includes(k)).map((k) => ({ ...COL_BY_KEY[k], w: widths[k] || COL_BY_KEY[k].w }));
    const fi = list.findIndex((c) => c.key === frozenThrough);
    let left = 48;
    return list.map((c, i) => {
      if (i > fi) return { ...c, left: null, edge: false };
      const out = { ...c, left, edge: i === fi };
      left += c.w;
      return out;
    });
  }, [order, hiddenCols, frozenThrough, widths]);
  const GRID = `48px ${cols.map((c) => `${c.w}px`).join(" ")}`;
  const [statusMenu, setStatusMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const gridRef = useRef(null);
  const lastSelRef = useRef(null);
  const pendingEditRef = useRef(null);

  // Only admins edit the Management sheet; everyone else can read it.
  const canEdit = currentUser?.role === "admin";

  const { viewMonth, refDay, openInMonth, inView } = useSheetMonth({ allDays, month, pickedDay, today });

  useSheetData({ clientsProp, setClients, setLoading, setOptions, setTasks, setToday, setUpdates });
  const { activeUsers, noteFor, views, fieldValue, dayTasks, monthCount, visible, orderOf, groups, flatRows } = useSheetView({ clients, collapsed, didCollapseOnLoad, filters, groupBy, hiddenRows, inView, loading, openInMonth, query, ranges, refDay, setCollapsed, sort, tasks, updates, users });

  const { undoRef, inGroup, save, saveNote } = useSheetSave({ currentUser, noteFor, refDay, setTasks, setUpdates });
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // --- Cell ranges, fill, copy / paste, undo (as on the other sheets) ---
  const [rangeEnd, setRangeEnd] = useState(null); // other corner of a block, { r, c }
  const [fillTo, setFillTo] = useState(null); // row id the fill handle is dragged to
  const dragSelRef = useRef(false);
  const fillRef = useRef(false);
  const checkDragRef = useRef(null); // { on } while dragging down the checkboxes
  const [rowDrag, setRowDrag] = useState(null); // ids being dragged
  const [dropAt, setDropAt] = useState(null); // { id, pos: "above" | "below" }

  const { dropRows } = useSheetDrop({ flatRows, inGroup, orderOf, rowDrag, save, setDropAt, setRowDrag });
  const { colIndex, block, isMulti, fillIdx, copyBlock, pasteText, clearBlock, undo } = useSheetClipboard({ activeUsers, canEdit, cell, checkDragRef, clients, cols, dragSelRef, fillRef, fillTo, flatRows, inGroup, noteFor, options, rangeEnd, save, saveNote, setCell, setFillTo, setRangeEnd, taskById, undoRef, views });
  const { editValue, commitText, focusGrid, moveCell, startEdit, finishEdit, onGridKey } = useSheetEditing({ canEdit, cell, clearBlock, colIndex, cols, copyBlock, editing, flatRows, gridRef, isMulti, lastSelRef, menu, noteFor, pendingEditRef, rangeEnd, save, saveNote, setCell, setEditing, setMenu, setRangeEnd, setSel, taskById, undo });
  const { addRow, addRows, selIds, visIds, allVisSel, someVisSel, toggleRow, bulkStatus, bulkDuplicate, bulkDelete, addingRows } = useSheetRows({ flatRows, inGroup, lastSelRef, pendingEditRef, refDay, save, sel, setConfirmDelete, setDeleting, setFilters, setQuery, setSel, setStatusMenu, setTasks, taskById });
  const { valuesFor, toggleFilter, activeFields, clearFilters, allCollapsed, toggleAll, exportSheet, activeTask, activeCol, formulaEditable, formulaValue } = useSheetFilters({ canEdit, cell, collapsed, cols, dayTasks, editValue, fieldValue, filters, flatRows, groupBy, groups, options, setCollapsed, setFilters, setQuery, setRanges, taskById, viewMonth, views });

  const shell = (children) => <div className="flex h-full flex-col bg-white">{children}</div>;

  const control = { boxShadow: `inset 0 0 0 1px ${C.n200}` };

  const headerCell = (col) => renderHeaderCell(ctx, col);

  const renderCell = (t, v, col, ri, ci) => renderSheetCell(ctx, t, v, col, ri, ci);

  const ctx = {
    GRID,
    activeCol,
    activeFields,
    activeTask,
    activeUsers,
    addRow,
    addRows,
    addingRows,
    allCollapsed,
    allDays,
    allVisSel,
    block,
    bulkDelete,
    bulkDuplicate,
    bulkStatus,
    canEdit,
    cell,
    checkDragRef,
    clearFilters,
    clients,
    collapsed,
    cols,
    commitText,
    confirmDelete,
    control,
    copyBlock,
    dayTasks,
    deleting,
    dragCol,
    dragSelRef,
    dropAt,
    dropRows,
    editing,
    exportSheet,
    fillIdx,
    fillRef,
    filterMenu,
    filters,
    finishEdit,
    flatRows,
    focusGrid,
    formulaEditable,
    formulaValue,
    frozenThrough,
    gridRef,
    groupBy,
    groups,
    headMenu,
    headerCell,
    hiddenCols,
    hiddenRows,
    historyOpen,
    isMulti,
    loading,
    menu,
    monthCount,
    moveCell,
    noteFor,
    options,
    query,
    ranges,
    renderCell,
    rowDrag,
    save,
    saveNote,
    sel,
    selIds,
    setCell,
    setCollapsed,
    setConfirmDelete,
    setDragCol,
    setDropAt,
    setEditing,
    setFillTo,
    setFilterMenu,
    setFilters,
    setFrozenThrough,
    setGroupBy,
    setHeadMenu,
    setHiddenCols,
    setHiddenRows,
    setHistoryOpen,
    setMenu,
    setMonth,
    setOrder,
    setPickedDay,
    setQuery,
    setRangeEnd,
    setRanges,
    setRowDrag,
    setSel,
    setSort,
    setStatusMenu,
    someVisSel,
    sort,
    startEdit,
    startResize,
    statusMenu,
    today,
    toggleAll,
    toggleFilter,
    toggleRow,
    valuesFor,
    viewMonth,
    views,
    visIds,
    visible,
  };
  const tabsWithCount =
    tabs && cloneElement(tabs, { counts: { ...(tabs.props.counts || {}), Projects: dayTasks.length } });

  return shell(
    <>
      <div className="border-b border-[#eaeef4] bg-white">
        <SheetTitleRow {...ctx} />
        {tabsWithCount}

        <SheetToolbar {...ctx} />

        <SheetFilterChips {...ctx} />
      </div>

      <SheetFormula {...ctx} />

      <div className="relative min-h-0 flex-1">
        <div
          ref={gridRef}
          tabIndex={0}
          onKeyDown={onGridKey}
          onPaste={(e) => {
            if (e.target !== e.currentTarget || editing || menu) return;
            e.preventDefault();
            pasteText(e.clipboardData.getData("text/plain"));
          }}
          className="h-full overflow-auto outline-none"
          style={{ userSelect: "none" }}
        >
          <div role="grid" aria-label="Management sheet" style={{ width: "max-content", minWidth: "100%" }}>
            <GridHeaderRow {...ctx} />

            <GridSkeleton {...ctx} />

            <GridGroups {...ctx} />

            <GridEmpty {...ctx} />
          </div>
        </div>

        <SheetBulkBar {...ctx} />
      </div>

      <SheetRangeBar {...ctx} />

      <SheetDialogs {...ctx} />
    </>
  );
}

export default ProjectsSheet;
