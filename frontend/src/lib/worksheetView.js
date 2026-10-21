import { trackEvent } from "@/analytics";
import { isDeliverableMissing } from "@/lib/deliverableRules";
import {
  matchesDeliverableFilter,
  matchesProjectFilter,
  matchesReviewerFilter,
} from "@/lib/worksheetFilterOptions";
import { durationSecondsOf } from "@/lib/quantity";
import { makeMatcher, searchTokens } from "@/lib/search";
import { slugify, todayStamp } from "@/lib/exportCsv";

// Pure rules behind the Work Sheet page (what rows a tab/filter shows, the
// tab counts, the sort order, the CSV layout, the analytics for a row's
// context). They live here, away from the page's React state, so they can be
// tested on their own.

export const anyDialogOpen = () =>
  Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));

export const emptyFilters = {
  search: "",
  status: "",
  deliverable_type: "",
  work_category: "",
  month: "",

  date_from: "",
  date_to: "",

  project_ids: [],
  deliverable_ids: [],
  stages: [],
  deliverable_types: [],
  work_categories: [],
  creator_ids: [],
  reviewer_ids: [],
  statuses: [],
};
export const LS = { client: "ws_last_client_id", project: "ws_last_project_id", deliverable: "ws_last_deliverable_id", stage: "ws_last_stage" };
export const DEPARTMENT_TO_STAGE = {
  Content: "Content",
  Design: "Design",
  Animation: "Animate",
};


export const trackWorksheetContext = (item, previousItem, patch) => {
  const contextFields = [
    "client_id",
    "project_id",
    "deliverable_id",
    "deliverable_not_available",
  ];

  // Do not track unrelated edits such as remarks, status, date, etc.
  const changedContextField = contextFields.some(
    (field) => patch[field] !== undefined
  );

  if (!changedContextField || !item) return;

  const hasClient = Boolean(item.client_id);
  const hasProject = Boolean(item.project_id);
  const hasDeliverable = Boolean(
    item.deliverable_id || item.deliverable_not_available
  );

  const previousHasClient = Boolean(previousItem?.client_id);
  const previousHasProject = Boolean(previousItem?.project_id);
  const previousHasDeliverable = Boolean(
    previousItem?.deliverable_id || previousItem?.deliverable_not_available
  );

  const contextStatus =
    hasClient && hasProject && hasDeliverable
      ? "complete"
      : hasClient && !hasProject && !hasDeliverable
        ? "client_only"
        : !hasClient
          ? "missing_client"
          : "incomplete";

  // Avoid repeatedly tracking the same incomplete state on every edit.
  const contextChanged =
    hasClient !== previousHasClient ||
    hasProject !== previousHasProject ||
    hasDeliverable !== previousHasDeliverable;

  if (!contextChanged) return;

  trackEvent("worksheet_context_saved", {
    row_id: item.id,
    context_status: contextStatus,
    has_client: hasClient,
    has_project: hasProject,
    has_deliverable: hasDeliverable,
    deliverable_not_available: Boolean(item.deliverable_not_available),
    missing_fields: [
      ...(!hasClient ? ["client"] : []),
      ...(!hasProject ? ["project"] : []),
      ...(!hasDeliverable ? ["deliverable"] : []),
    ],
  });
};


// The rows a sheet shows for the current tab, month, search and filters.
export const filterWorkItems = ({
  items,
  filters,
  deferredSearch,
  month,
  activeSheet,
  clientNameById,
  projectById,
  userNameById,
  onlyMissing,
  deliverableTypeCategories,
}) => {
  const sheetStage =
    activeSheet === "Master"
      ? null
      : (DEPARTMENT_TO_STAGE[activeSheet] || activeSheet).trim().toLowerCase();

  const selectedStages =
    activeSheet === "Master" && filters.stages?.length
      ? new Set(filters.stages.map((s) => String(s).trim().toLowerCase()))
      : null;

  // Every word has to match somewhere in the row, in any order, so
  // "icici contra carousel" finds a carousel in ICICI's Contra Fund
  // project even though those words sit in different columns.
  const matchesSearch = makeMatcher(deferredSearch);
  const search = searchTokens(deferredSearch).length > 0;
  const projectIds = filters.project_ids?.length ? new Set(filters.project_ids) : null;
  const deliverableIds = filters.deliverable_ids?.length ? new Set(filters.deliverable_ids) : null;
  const deliverableTypes = filters.deliverable_types?.length ? new Set(filters.deliverable_types) : null;
  const workCategories = filters.work_categories?.length ? new Set(filters.work_categories) : null;
  const creatorIds = filters.creator_ids?.length ? new Set(filters.creator_ids) : null;
  const reviewerIds = filters.reviewer_ids?.length ? new Set(filters.reviewer_ids) : null;
  const statuses = filters.statuses?.length ? new Set(filters.statuses) : null;

  return items.filter((item) => {
    const itemStage = String(item.stage || "").trim().toLowerCase();

    // Department sheets are hard-scoped to their own stage. Master can
    // optionally scope to a Stage selection from the filter panel.
    if (sheetStage) {
      if (itemStage !== sheetStage) return false;
    } else if (selectedStages && !selectedStages.has(itemStage)) {
      return false;
    }

    if (search) {
      // Same fallback WorkSheetRow uses to resolve a row's client: the
      // row's own client_id, or failing that, its project's client_id.
      const project = projectById.get(item.project_id);
      const effectiveClientId = item.client_id || project?.client_id;
      const clientName = effectiveClientId
        ? clientNameById.get(effectiveClientId) || ""
        : "";
      const projectName = project?.name || "";

      const owner = userNameById.get(item.creator_id) || "";

      if (
        !matchesSearch(
          item.deliverable_name,
          item.remarks,
          clientName,
          projectName,
          item.deliverable_type,
          owner
        )
      ) {
        return false;
      }
    }

    if (
      onlyMissing &&
      !isDeliverableMissing(item, deliverableTypeCategories)
    ) {
      return false;
    }

    if (filters.date_from && (item.work_date || "") < filters.date_from) return false;
    if (filters.date_to && (item.work_date || "") > filters.date_to) return false;
    if (filters.month && item.month !== filters.month) return false;
    if (month && (item.month || (item.work_date || "").slice(0, 7)) !== month) return false;

    if (projectIds && !matchesProjectFilter(item, projectIds)) return false;
    if (deliverableIds && !matchesDeliverableFilter(item, deliverableIds)) return false;
    if (deliverableTypes && !deliverableTypes.has(item.deliverable_type)) return false;
    if (workCategories && !workCategories.has(item.work_category)) return false;
    if (creatorIds && !creatorIds.has(item.creator_id)) return false;
    if (reviewerIds && !matchesReviewerFilter(item, reviewerIds)) return false;
    if (statuses && !statuses.has(item.status)) return false;

    return true;
  });
};

// Per-tab counts shown next to each tab label (see the page for the rules).
export const countTabs = ({ items, month, projectTasks }) => {
  const counts = { Master: 0, Content: 0, Design: 0, Animate: 0 };

  items.forEach((item) => {
    if (
      month &&
      (item.month || (item.work_date || "").slice(0, 7)) !== month
    ) {
      return;
    }
    counts.Master += 1;
    const stage = String(item.stage || "").trim();
    if (stage === "Content") counts.Content += 1;
    else if (stage === "Design") counts.Design += 1;
    else if (stage === "Animate") counts.Animate += 1;
  });

  // Management: tasks whose Date (start date) is in the month on screen,
  // same as the other sheets place a row by its work date.
  if (projectTasks) {
    const m = month || (projectTasks.today || "").slice(0, 7);
    counts.Projects = (projectTasks.tasks || []).filter(
      (t) => (t.start_date || "").slice(0, 7) === m
    ).length;
  }

  return counts;
};

export const sortWorkItems = (filteredItems, sortDirection) => {
  return [...filteredItems].sort((a, b) => {
    const dateA = a.work_date || "";
    const dateB = b.work_date || "";

    if (dateA !== dateB) {
      return sortDirection === "desc"
        ? dateB.localeCompare(dateA)
        : dateA.localeCompare(dateB);
    }

    // Same work_date: break the tie by creation time, newest first,
    // so a just-added row doesn't get lost among older same-day rows
    // (matters most after a re-fetch, e.g. following hide/unhide).
    const createdA = a.created_at || "";
    const createdB = b.created_at || "";
    return createdB.localeCompare(createdA);
  });
};

export const countActiveFilters = (filters) =>
  Number(Boolean(filters.date_from || filters.date_to)) +
  (filters.project_ids?.length || 0) +
  (filters.deliverable_ids?.length || 0) +
  (filters.stages?.length || 0) +
  (filters.deliverable_types?.length || 0) +
  (filters.work_categories?.length || 0) +
  (filters.creator_ids?.length || 0) +
  (filters.reviewer_ids?.length || 0) +
  (filters.statuses?.length || 0);

// The CSV for the rows on screen: file name, header and body rows.
export const buildWorksheetCsv = ({
  sortedItems,
  activeSheet,
  excludedColumns = [],
  month,
  projectById,
  clientNameById,
  userNameById,
}) => {
  const allColumns = [
    "Date", "Client", "Project", "Stage", "Deliverable", "Type", "Qty",
    "Duration", "Category", "Version", "Time (min)", "Creator",
    "Reviewer", "Status", "Remarks", "Link",
  ];
  // Same columns as the tab on screen (Qty / Duration are left out of the
  // sheets that don't use them).
  const keep = allColumns.map((name) => !excludedColumns.includes(name));
  // Duration is exported as plain seconds.
  const header = allColumns
    .filter((_, i) => keep[i])
    .map((name) => (name === "Duration" ? "Duration (sec)" : name));
  const rows = sortedItems.map((item) => {
    const project = projectById.get(item.project_id);
    const clientId = item.client_id || project?.client_id;
    return [
      item.work_date || "",
      (clientId && clientNameById.get(clientId)) || "",
      project?.name || "",
      item.stage || "",
      item.deliverable_name || "",
      item.deliverable_type || "",
      item.quantity > 1 ? item.quantity : "",
      durationSecondsOf(item) ?? "",
      item.work_category || "",
      item.version || "",
      item.time_taken_minutes ?? "",
      userNameById.get(item.creator_id) || "",
      userNameById.get(item.reviewer_id) || "",
      item.status || "",
      item.remarks || "",
      item.deliverable_link || "",
    ].filter((_, i) => keep[i]);
  });

  const name = [
    "worksheet",
    slugify(activeSheet),
    month || "all-months",
    todayStamp(),
  ].join("-");

  return { filename: `${name}.csv`, header, rows };
};
