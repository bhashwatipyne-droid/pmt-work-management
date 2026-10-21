import { COLS, FIELDS } from "@/components/work-sheet/projects-sheet/sheetColumns";
import { downloadCsv, todayStamp } from "@/lib/exportCsv";
import { toast } from "sonner";

export function useSheetFilters({ canEdit, cell, collapsed, cols, dayTasks, editValue, fieldValue, filters, flatRows, groupBy, groups, options, setCollapsed, setFilters, setQuery, setRanges, taskById, viewMonth, views }) {
  // --- Filters ----------------------------------------------------------
  const valuesFor = (field) => {
    const counts = new Map();
    dayTasks.forEach((t) => {
      const fv = fieldValue(views.get(t.id), field);
      (Array.isArray(fv) ? fv : [fv]).forEach((v) => v && counts.set(v, (counts.get(v) || 0) + 1));
    });
    const base =
      field === "status"
        ? options.statuses || []
        : field === "type"
          ? options.task_types || []
          : field === "follow"
            ? ["Due", "Overdue"]
            : field === "with"
              ? options.teams || []
            : [...counts.keys()].sort((a, b) => a.localeCompare(b));
    const all = [...new Set([...base, ...counts.keys()])];
    return all.map((v) => ({
      value: v,
      label: field === "follow" ? (v === "Due" ? "Due by this day" : "Overdue") : v,
      count: counts.get(v) || 0,
    }));
  };
  const toggleFilter = (field, value) =>
    setFilters((f) => {
      const cur = f[field] || [];
      return { ...f, [field]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] };
    });
  const activeFields = FIELDS.filter((f) => filters[f.key]?.length);
  const clearFilters = () => {
    setRanges({});
    setFilters({});
    setQuery("");
  };

  const allCollapsed = groups.length > 0 && groupBy !== "none" && groups.every((g) => collapsed[g.key]);
  const toggleAll = () =>
    setCollapsed(allCollapsed ? {} : Object.fromEntries(groups.map((g) => [g.key, true])));

  // Export: the rows on screen, in the columns on screen.
  const exportSheet = () => {
    const header = cols.map((c) => c.label);
    const rows = flatRows.map((t) => {
      const v = views.get(t.id);
      return cols.map((c) => (c.key === "owner" ? v.ownerText : v[c.key]) ?? "");
    });
    downloadCsv(`worksheet-management-${viewMonth}-${todayStamp()}.csv`, header, rows);
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  };

  // --- Formula bar ------------------------------------------------------
  const activeTask = cell ? taskById.get(cell.r) : null;
  const activeCol = cell ? COLS.find((c) => c.key === cell.c) : null;
  const activeView = activeTask ? views.get(activeTask.id) : null;
  const formulaEditable = !!activeTask && canEdit && ["text", "number"].includes(activeCol?.kind);
  const formulaValue = activeTask
    ? formulaEditable
      ? editValue(activeTask, activeCol.key)
      : activeCol.key === "owner"
        ? activeView.ownerText
        : activeCol.key === "remark"
          ? activeView.remark
          : String(activeView[activeCol.key] ?? "")
    : "";

  return { valuesFor, toggleFilter, activeFields, clearFilters, allCollapsed, toggleAll, exportSheet, activeTask, activeCol, formulaEditable, formulaValue };
}
