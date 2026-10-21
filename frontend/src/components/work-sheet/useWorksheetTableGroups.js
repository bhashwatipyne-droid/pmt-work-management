import { useCallback, useMemo } from "react";
import { GROUP_KEY_RESOLVERS } from "./workSheetTableConfig";

// Clusters the visible rows into groups and builds the entries actually
// rendered (group headers plus the rows of expanded groups).
export function useWorksheetTableGroups({ visibleTableItems, groupBySafe, usersById, collapsedGroupKeys }) {
  // Clusters visibleTableItems into groups, in first-seen order, without
  // disturbing each group's own internal (drag/sort) order. `summaries`
  // carries the per-group row-count/time rollup the header row displays.
  //
  // The Member resolver needs `usersById` (component data), so it's built
  // here rather than read off the static GROUP_KEY_RESOLVERS map — a
  // creator_id that no longer resolves to a real user (a deactivated or
  // deleted account) is folded into the same "__unassigned__" bucket as
  // rows with no creator at all, rather than becoming its own
  // one-off "Unassigned" group per orphaned id.
  const resolveGroupKey = useCallback(
    (item) => {
      if (groupBySafe === "Member") {
        const id = item.creator_id;
        return id && usersById[id] ? id : "__unassigned__";
      }
      return GROUP_KEY_RESOLVERS[groupBySafe]?.(item);
    },
    [groupBySafe, usersById]
  );

  const groupInfo = useMemo(() => {
    if (!groupBySafe) return null;

    const order = [];
    const buckets = new Map();
    const summaries = new Map();

    for (const item of visibleTableItems) {
      const key = resolveGroupKey(item);

      if (!buckets.has(key)) {
        buckets.set(key, []);
        summaries.set(key, { count: 0, minutes: 0 });
        order.push(key);
      }

      buckets.get(key).push(item);

      const summary = summaries.get(key);
      summary.count += 1;
      summary.minutes += Number(item.time_taken_minutes) || 0;
    }

    return { order, buckets, summaries };
  }, [visibleTableItems, groupBySafe, resolveGroupKey]);

  const getGroupLabel = useCallback(
    (key) => {
      if (groupBySafe === "Member") {
        return usersById[key]?.name || "Unassigned";
      }
      return key;
    },
    [groupBySafe, usersById]
  );

  // sortedTableItems stays the single source of truth for row numbering,
  // fill, selection, and keyboard nav — exactly as before grouping
  // existed — it's just now, when grouped, clustered by group and with
  // collapsed groups' rows excluded entirely (the same way hidden rows
  // already are). displayEntries is the parallel list actually rendered
  // (it additionally carries the header rows), built in the same pass so
  // the two can never drift apart: every "row" entry in displayEntries
  // gets a rowIndex equal to its position in sortedTableItems.
  const { sortedTableItems, displayEntries } = useMemo(() => {
    if (!groupInfo) {
      return {
        sortedTableItems: visibleTableItems,
        displayEntries: visibleTableItems.map((item, i) => ({
          type: "row",
          item,
          rowIndex: i + 1,
        })),
      };
    }

    const rows = [];
    const entries = [];
    let rowIndex = 0;

    for (const key of groupInfo.order) {
      const isCollapsed = collapsedGroupKeys.has(key);

      entries.push({
        type: "header",
        key,
        isCollapsed,
        label: getGroupLabel(key),
        summary: groupInfo.summaries.get(key),
      });

      if (isCollapsed) continue;

      for (const item of groupInfo.buckets.get(key)) {
        rowIndex += 1;
        rows.push(item);
        entries.push({ type: "row", item, rowIndex });
      }
    }

    return { sortedTableItems: rows, displayEntries: entries };
  }, [groupInfo, visibleTableItems, collapsedGroupKeys, getGroupLabel]);

  return {
    resolveGroupKey,
    groupInfo,
    sortedTableItems,
    displayEntries,
  };
}
