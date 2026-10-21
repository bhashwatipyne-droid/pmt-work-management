import { useCallback, useMemo } from "react";
import { NOT_AVAILABLE_LABEL } from "@/lib/deliverableRules";
import { durationSecondsOf, isQtySet, quantityOf } from "@/lib/quantity";
import { COLUMN_FIELDS } from "./workSheetTableConfig";

// Column sort, the person's own drag order, hidden rows and the row numbers
// derived from them.
export function useWorksheetTableRows({ items, projects, clients, deliverables, usersById, columnSort, rowOrder, hiddenRows }) {
  const getSortValue = useCallback(
    (item, column) => {
      if (column === "Qty") return isQtySet(item) ? quantityOf(item) : "";
      if (column === "Duration") return durationSecondsOf(item) ?? "";

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
        value = item.deliverable_not_available
          ? NOT_AVAILABLE_LABEL
          : deliverables.find((d) => d.id === item.deliverable_id)?.name || "";
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

  return {
    getSortValue,
    visibleTableItems,
    hiddenRowsBeforeById,
    displayRowNumberById,
  };
}
