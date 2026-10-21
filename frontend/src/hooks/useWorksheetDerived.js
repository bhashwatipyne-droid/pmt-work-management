import { useDeferredValue, useMemo } from "react";
import { isDeliverableMissing } from "@/lib/deliverableRules";
import { countTabs, filterWorkItems, sortWorkItems } from "@/lib/worksheetView";

// What the Work Sheet shows for the current tab, month, search and filters.
export function useWorksheetDerived({ items, clients, users, projects, options, filters, loadingFullList, month, activeSheet, onlyMissing, projectTasks, sortDirection }) {
  const clientNameById = useMemo(() => {
    const map = new Map();
    clients.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [clients]);

  const userNameById = useMemo(() => {
    const map = new Map();
    (users || []).forEach((u) => map.set(u.id, u.name || ""));
    return map;
  }, [users]);

  const projectById = useMemo(() => {
    const map = new Map();
    projects.forEach((p) => map.set(p.id, p));
    return map;
  }, [projects]);

  // Typing stays instant; filtering the rows follows it.
  const deferredSearch = useDeferredValue(filters.search || "");
  // Not "no results" yet: the list is catching up with the typing, or the
  // full list is still arriving behind the fast first slice.
  const searchPending =
    deferredSearch !== (filters.search || "") ||
    (loadingFullList && Boolean((filters.search || "").trim()));

  const filteredItems = useMemo(
    () =>
      filterWorkItems({
        items,
        filters,
        deferredSearch,
        month,
        activeSheet,
        clientNameById,
        projectById,
        userNameById,
        onlyMissing,
        deliverableTypeCategories: options.deliverable_type_categories,
      }),
    [
      items,
      filters,
      deferredSearch,
      month,
      activeSheet,
      clientNameById,
      projectById,
      userNameById,
      onlyMissing,
      options.deliverable_type_categories,
    ]
  );

  // Toolbar's "N missing a deliverable" badge — purely informational, so
  // scoped the same as the visible row count (post search/filter) rather
  // than some separate, harder-to-explain total.
  const missingDeliverableCount = useMemo(
    () =>
      filteredItems.filter((item) =>
        isDeliverableMissing(item, options.deliverable_type_categories)
      ).length,
    [filteredItems, options.deliverable_type_categories]
  );

  // Per-tab counts shown next to each tab label (e.g. "Content 7") —
  // scoped to the tab's own stage and to the month on screen (same rule the
  // row filter uses), independent of any active search/filter, so switching
  // filters doesn't make the tabs themselves jump around. With "every month"
  // selected (month = "") this is the all-time total.
  const tabCounts = useMemo(
    () => countTabs({ items, month, projectTasks }),
    [items, month, projectTasks]
  );

  const sortedItems = useMemo(
    () => sortWorkItems(filteredItems, sortDirection),
    [filteredItems, sortDirection]
  );

  return {
    clientNameById,
    userNameById,
    projectById,
    searchPending,
    filteredItems,
    missingDeliverableCount,
    tabCounts,
    sortedItems,
  };
}
