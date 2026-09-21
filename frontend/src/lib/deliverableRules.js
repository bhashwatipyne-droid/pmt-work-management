// Mirrors backend `deliverable_required_for` / `apply_deliverable_rules`
// (backend/server.py). The backend is the source of truth; these helpers only
// let the worksheet flag a missing deliverable and skip a doomed request.

// Value used by the worksheet's Deliverable dropdown for "Not available".
// It is never sent to the API: choosing it saves deliverable_not_available.
export const NOT_AVAILABLE_VALUE = "__not_available__";
export const NOT_AVAILABLE_LABEL = "Not available";

// Moving a row into one of these statuses needs a deliverable (or "Not
// available"). Reviewer statuses (Changes Requested / Rework / Closed) are
// intentionally not gated.
export const DELIVERABLE_GATED_STATUSES = ["Ongoing", "Ready for Review"];

export const DELIVERABLE_REQUIRED_MESSAGE =
  "Please select a deliverable (or choose 'Not available') before moving this row forward.";

// Client work only: a row needs a project (that is where deliverables live)
// and must not be Non-Core work (meetings, hiring, trainings...).
export const isDeliverableRequired = (item, typeCategories = {}) => {
  if (!item?.project_id) return false;
  const category =
    item.work_category || typeCategories?.[item.deliverable_type] || "";
  return category !== "Non-Core";
};

export const isDeliverableMissing = (item, typeCategories = {}) =>
  isDeliverableRequired(item, typeCategories) &&
  !item.deliverable_id &&
  !item.deliverable_not_available;