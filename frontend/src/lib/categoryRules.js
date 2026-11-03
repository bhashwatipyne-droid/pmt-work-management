// Team-specific categories. A deliverable type normally has the one category the
// server lists in options.deliverable_type_categories, but a team can treat a
// type differently. Keyed by the row's stage: a member can only log rows on their
// own department's stage, so the stage is the team.
//   Animate -> Data Updation is Non-Core for the Animation team only.
// Mirrors STAGE_CATEGORY_OVERRIDES in backend/domain_constants.py, which is the
// source of truth - the server enforces it on every save. This only lets the
// sheet show and send the right category straight away.
export const STAGE_CATEGORY_OVERRIDES = {
  Animate: { "Data Updation": "Non-Core" },
};

// The team-specific category for this type on this stage, or null.
export const categoryOverride = (stage, type) =>
  (stage && STAGE_CATEGORY_OVERRIDES[stage]?.[type]) || null;

// The category of a deliverable type for a row on `stage`. `categories` is
// options.deliverable_type_categories.
export const categoryForType = (categories, type, stage) =>
  categoryOverride(stage, type) || categories?.[type] || "";
