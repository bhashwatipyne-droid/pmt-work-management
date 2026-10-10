// Special choices that sit at the top of the Project / Deliverable / Reviewer
// filter lists, both in the column menus and in the main filter panel. They are
// stored in the same arrays as real ids (project_ids, deliverable_ids,
// reviewer_ids), so selecting one is just another checked box. The values can't
// clash with a real id because ids are never wrapped in double underscores.

import { NOT_AVAILABLE_LABEL } from "@/lib/deliverableRules";
import { projectIdsOf } from "@/lib/quantity";

export const FILTER_BLANK = "__blank__";
export const FILTER_NOT_AVAILABLE = "__not_available__";
export const FILTER_UNASSIGNED = "__unassigned__";

export const PROJECT_SPECIAL_OPTIONS = [
  { value: FILTER_BLANK, label: "Blanks" },
];

export const DELIVERABLE_SPECIAL_OPTIONS = [
  { value: FILTER_BLANK, label: "Blanks" },
  { value: FILTER_NOT_AVAILABLE, label: NOT_AVAILABLE_LABEL },
];

export const REVIEWER_SPECIAL_OPTIONS = [
  { value: FILTER_UNASSIGNED, label: "Unassigned" },
];

// A project filter matches a row if its project is ticked, or "Blanks" is
// ticked and the row has no project.
// A Campaign Ideation Plan row covers several projects and matches any of them.
export const matchesProjectFilter = (item, selected) => {
  const ids = projectIdsOf(item);
  return (
    ids.some((id) => selected.has(id)) ||
    (selected.has(FILTER_BLANK) && ids.length === 0)
  );
};

// "Blanks" = no deliverable picked and not marked "Not available";
// "Not available" = the row was explicitly marked that way.
export const matchesDeliverableFilter = (item, selected) =>
  selected.has(item.deliverable_id) ||
  (selected.has(FILTER_BLANK) &&
    !item.deliverable_id &&
    !item.deliverable_not_available) ||
  (selected.has(FILTER_NOT_AVAILABLE) && Boolean(item.deliverable_not_available));

export const matchesReviewerFilter = (item, selected) =>
  selected.has(item.reviewer_id) ||
  (selected.has(FILTER_UNASSIGNED) && !item.reviewer_id);