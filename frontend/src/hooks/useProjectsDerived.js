import { useMemo } from "react";
import { PROJECT_STATUSES } from "@/constants/projectPalette";
import { sortProjects } from "@/lib/projectSort";
import { buildLookalikeIndex } from "@/lib/lookalikes";
import { makeMatcher } from "@/lib/search";

// What the Projects board and list show: search/filter results, look-alike hints and the sorted columns.
export function useProjectsDerived({ projects, deferredSearch, deliverableNamesByProject, statusFilter, clientFilter, pocFilter, dateFrom, dateTo, sortBy }) {
  const filtered = useMemo(() => {
    const match = makeMatcher(deferredSearch);

    return projects
      .filter((p) => {
        if (statusFilter && p.status !== statusFilter) return false;

        if (clientFilter && p.client_id !== clientFilter) return false;

        if (
          pocFilter &&
          (p.client_poc || "").toLowerCase() !== pocFilter.toLowerCase()
        ) {
          return false;
        }

        // Filter by project due date
        const endDay = (p.end_date || "").slice(0, 10);
        if (dateFrom && (!endDay || endDay < dateFrom)) return false;
        if (dateTo && (!endDay || endDay > dateTo)) return false;

        return match(
          p.name,
          p.code,
          p.client_name,
          p.description,
          deliverableNamesByProject?.[p.id]
        );
      });
    // Filtering only here — the active "Sort by" choice is applied once,
    // below, and reused for both the list rows and the Kanban columns so
    // the two views never disagree about the order.
  }, [projects, deferredSearch, deliverableNamesByProject, statusFilter, clientFilter, pocFilter, dateFrom, dateTo]);


  // "Looks like …" on cards and list rows: names people confuse when they
  // log time. A hint to rename one, or at least add a description.
  const lookalikeIndex = useMemo(() => {
    const clientNames = new Map(projects.map((p) => [p.client_id, p.client_name || ""]));
    return buildLookalikeIndex(projects, (id) => clientNames.get(id) || "");
  }, [projects]);

  const lookalikeTextById = useMemo(() => {
    const texts = new Map();
    lookalikeIndex.forEach((twins, id) => {
      texts.set(
        id,
        `Looks like ${twins[0].name}${twins.length > 1 ? ` +${twins.length - 1}` : ""}`
      );
    });
    return texts;
  }, [lookalikeIndex]);

  // For the "Look-alikes first" sort: projects that look alike share a key
  // (the alphabetically first name in the group), so they land side by side.
  const sortContext = useMemo(() => {
    const lookalikeKeyById = new Map();
    const byId = new Map(projects.map((p) => [p.id, p]));
    lookalikeIndex.forEach((twins, id) => {
      const names = [byId.get(id)?.name, ...twins.map((t) => t.name)]
        .map((n) => String(n || "").trim().toLowerCase())
        .sort();
      lookalikeKeyById.set(id, names[0]);
    });
    return { lookalikeKeyById };
  }, [projects, lookalikeIndex]);

  const sortedFiltered = useMemo(
    () => sortProjects(filtered, sortBy, sortContext),
    [filtered, sortBy, sortContext]
  );

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(
      PROJECT_STATUSES.map((s) => [s, []])
    );

    filtered.forEach((p) => {
      if (map[p.status]) {
        map[p.status].push(p);
      }
    });

    if (sortBy) {
      // A sort is explicitly chosen: same control and comparator as the
      // list view (see sortedFiltered above), applied within each column.
      // Dragging a card between columns still changes its status as
      // before; dragging to reorder within a column no longer has a
      // visible effect while a sort is active, since the column re-sorts
      // by the chosen criterion on every render.
      Object.keys(map).forEach((status) => {
        map[status] = sortProjects(map[status], sortBy, sortContext);
      });
    } else {
      // "No sorting": the manual drag order (kanban_order) — restores
      // ordinary drag-to-reorder within a column.
      Object.values(map).forEach((items) => {
        items.sort((a, b) => {
          const orderA = Number.isFinite(Number(a.kanban_order))
            ? Number(a.kanban_order)
            : Number.MAX_SAFE_INTEGER;
          const orderB = Number.isFinite(Number(b.kanban_order))
            ? Number(b.kanban_order)
            : Number.MAX_SAFE_INTEGER;

          if (orderA !== orderB) return orderA - orderB;

          return new Date(b.start_date || 0).getTime() - new Date(a.start_date || 0).getTime();
        });
      });
    }

    return map;
  }, [filtered, sortBy, sortContext]);

  return {
    filtered,
    lookalikeTextById,
    sortedFiltered,
    byStatus,
  };
}
