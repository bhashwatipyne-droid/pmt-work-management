import { useDeferredValue, useMemo, useRef } from "react";
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

  // Like Google Sheets: a row you just edited stays on screen even if the edit
  // made it stop matching the filter (fill a blank on a "blanks only" filter and
  // the row does not vanish under your cursor). It is let go as soon as the
  // filters, search, month or tab change, or the page is reloaded.
  const stickyRef = useRef({ key: "", ids: new Set(), seen: new Map(), visible: new Set() });

  const filteredItems = useMemo(
    () => {
      const matching = filterWorkItems({
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
      });

      const key = JSON.stringify([filters, deferredSearch, month, activeSheet, onlyMissing]);
      const sticky = stickyRef.current;
      if (sticky.key !== key) {
        // a different view: nothing is held over, and nothing counts as "edited"
        sticky.key = key;
        sticky.ids = new Set();
        sticky.visible = new Set();
        sticky.seen = new Map();
      }

      const matchingIds = new Set(matching.map((item) => item.id));
      let kept = 0;
      for (const item of items) {
        if (matchingIds.has(item.id)) continue;
        const before = sticky.seen.get(item.id);
        // visible a moment ago and edited since (a new object): hold it
        if (sticky.ids.has(item.id) || (sticky.visible.has(item.id) && before && before !== item)) {
          sticky.ids.add(item.id);
          kept += 1;
        }
      }

      const result = kept
        ? items.filter((item) => matchingIds.has(item.id) || sticky.ids.has(item.id))
        : matching;

      sticky.visible = new Set(result.map((item) => item.id));
      sticky.seen = new Map(items.map((item) => [item.id, item]));
      return result;
    },
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
