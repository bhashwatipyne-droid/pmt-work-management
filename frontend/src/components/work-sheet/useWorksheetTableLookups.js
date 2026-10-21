import { useCallback, useMemo, useRef } from "react";
import { buildLookalikeIndex } from "@/lib/lookalikes";
import {
  DELIVERABLE_SPECIAL_OPTIONS,
  PROJECT_SPECIAL_OPTIONS,
  REVIEWER_SPECIAL_OPTIONS,
} from "@/lib/worksheetFilterOptions";
import { NO_COLLAB_IDS } from "./workSheetTableConfig";

// Lookups and filter-menu value lists derived from the sheet's data. All
// memoized on the underlying data only.
export function useWorksheetTableLookups({ items, users, options, projects, deliverables, clients, collabIndex }) {
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

  // For the Project picker: client names, the look-alike index among the
  // projects it can offer (not delivered/scrapped), and which projects each
  // person already has rows for ("Recently used").
  const clientNameById = useMemo(
    () => new Map((clients || []).map((client) => [client.id, client.name])),
    [clients]
  );

  const clientNameOf = useCallback(
    (clientId) => clientNameById.get(clientId) || "",
    [clientNameById]
  );

  const projectLookalikes = useMemo(
    () =>
      buildLookalikeIndex(
        projects || [],
        clientNameOf
      ),
    [projects, clientNameOf]
  );

  const recentProjectsByCreator = useMemo(() => {
    const map = new Map();

    for (const item of items || []) {
      if (!item.project_id || !item.creator_id) continue;
      if (!map.has(item.creator_id)) map.set(item.creator_id, new Set());
      map.get(item.creator_id).add(item.project_id);
    }

    return map;
  }, [items]);

  const usersById = useMemo(() => {
    const map = {};

    for (const user of users || []) {
      map[user.id] = user;
    }

    return map;
  }, [users]);

  const nonAdminUsers = useMemo(
    () => (users || []).filter((user) => user.role !== "admin" && user.role !== "hr"),
    [users]
  );

  const reviewerUsers = useMemo(
    () => (users || []).filter((user) => user.role !== "member" && user.role !== "hr"),
    [users]
  );

  // Read when a collaborator picker opens (so it always sees the live list)
  // through a stable function, so rows are not re-rendered for it.
  const collabIndexRef = useRef(collabIndex);
  collabIndexRef.current = collabIndex;
  const getCollabMemberIds = useCallback(
    (groupId) => (groupId && collabIndexRef.current?.get(groupId)) || NO_COLLAB_IDS,
    []
  );

  // Value lists for the per-column filter menus. Memoized on the
  // underlying data only (not on `filters` or any per-render state), so
  // opening/using one column's filter never recomputes or re-renders the
  // others — same reasoning as the big filter panel's fix.
  const projectFilterValues = useMemo(
    () => [
      ...PROJECT_SPECIAL_OPTIONS,
      ...(projects || []).map((p) => ({ value: p.id, label: p.name })),
    ],
    [projects]
  );
  const deliverableFilterValues = useMemo(
    () => [
      ...DELIVERABLE_SPECIAL_OPTIONS,
      ...(deliverables || []).map((d) => ({ value: d.id, label: d.name })),
    ],
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
    () => [
      ...REVIEWER_SPECIAL_OPTIONS,
      ...reviewerUsers.map((u) => ({ value: u.id, label: u.name })),
    ],
    [reviewerUsers]
  );

  return {
    deliverablesByProject,
    clientNameOf,
    projectLookalikes,
    recentProjectsByCreator,
    usersById,
    nonAdminUsers,
    reviewerUsers,
    getCollabMemberIds,
    projectFilterValues,
    deliverableFilterValues,
    stageFilterValues,
    typeFilterValues,
    categoryFilterValues,
    statusFilterValues,
    creatorFilterValues,
    reviewerFilterValues,
  };
}
