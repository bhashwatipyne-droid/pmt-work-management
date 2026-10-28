import { isMultiDeliverableRow } from "@/lib/quantity";

// Column definitions, field maps and sizing used by WorkSheetTable.

export const COLUMNS = [
  "Date",
  "Client",
  "Project",
  "Deliverable",
  "Stage",
  "Deliverable Name",
  "Deliverable Link",
  "Deliverable Type",
  "Qty",
  "Duration",
  "Category",
  "Version",
  "Time (min)",
  "Creator",
  "Reviewer",
  "Remarks",
  "Status",
];

export const FILL_FIELDS = {
  0: "work_date",
  1: "client_id",
  2: "project_id",
  3: "deliverable_id",
  4: "stage",
  5: "deliverable_name",
  6: "deliverable_link",
  7: "deliverable_type",
  8: "work_category",
  9: "version",
  10: "time_taken_minutes",
  11: "creator_id",
  12: "reviewer_id",
  13: "remarks",
  14: "status",
};

export const COLUMN_FIELDS = {
  Date: "work_date",
  Client: "client_id",
  Project: "project_id",
  Deliverable: "deliverable_id",
  Stage: "stage",
  "Deliverable Name": "deliverable_name",
  "Deliverable Link": "deliverable_link",
  "Deliverable Type": "deliverable_type",
  Category: "work_category",
  Version: "version",
  "Time (min)": "time_taken_minutes",
  Creator: "creator_id",
  Reviewer: "reviewer_id",
  Remarks: "remarks",
  Status: "status",
};

export const STAGES = ["Content", "Design", "Animate"];

// The text cells the formula bar can edit, and the field each one saves to.
export const FORMULA_EDITABLE_FIELDS = {
  "Deliverable Name": "deliverable_name",
  "Deliverable Link": "deliverable_link",
  Version: "version",
  Remarks: "remarks",
};
// Cells that are picked from a list rather than typed.
export const FORMULA_PICKER_COLUMNS = new Set([
  "Client",
  "Project",
  "Deliverable",
  "Stage",
  "Deliverable Type",
  "Category",
  "Reviewer",
  "Status",
]);
export const NO_COLUMNS = [];
export const NO_COLLAB_IDS = [];

// Columns a department's own sheet doesn't use. They are left out of that
// tab entirely (the "All" tab keeps every column): Duration only matters for
// video work. Content keeps Qty because a Campaign Ideation Plan row counts the
// deliverables ticked on it (every other Content row shows "—").
export const SHEET_EXCLUDED_COLUMNS = {
  Content: ["Duration"],
  Design: ["Duration"],
};

// What to send with a project / client / deliverable change so a Campaign
// Ideation Plan row also lets go of its ticked deliverables (they belong to the
// project) - the server does the same, this just keeps the sheet in step.
export const noDeliverablesFor = (item) =>
  isMultiDeliverableRow(item)
    ? { deliverable_ids: [], quantity: 1, quantity_items: [] }
    : {};

export const MEMBER_STAGE_BY_DEPARTMENT = {
  Content: "Content",
  Design: "Design",
  Animation: "Animate",
};

// New: worksheet grouping. "Stage" and "Member" are the only two grouped
// views (plus "None", the existing flat list) — each resolves an item to
// the key its group header row represents.
export const GROUP_KEY_RESOLVERS = {
  Stage: (item) => item.stage || "No stage",
  Member: (item) => item.creator_id || "__unassigned__",
};

// Decorative only — same dots already used elsewhere for Stage, repeated
// here so a grouped-by-Stage header row can carry the same color cue.
export const STAGE_DOT_COLORS = {
  Content: "bg-violet-600",
  Design: "bg-sky-500",
  Animate: "bg-amber-500",
};

export const formatGroupMinutes = (totalMinutes) => {
  if (!totalMinutes) return "0m";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
};

// Same "two-letter initials from a name" rule already used for the
// Creator/Reviewer avatar chips elsewhere in the sheet — kept local here
// rather than imported since WorkSheetRow's version isn't exported.
export const getGroupInitials = (name) => {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

// The worksheet is intentionally virtualized without adding a new dependency.
// Only the visible rows + a small overscan buffer are mounted in the DOM.
//
// Cells clip long text on one line (the full value is in the formula bar), so
// rows are all about the same height. Every mounted row is still measured (see
// rowObserver below), because a few cells can make a row taller; rows that have
// not been on screen yet are positioned with an estimate (ESTIMATED_ROW_HEIGHT
// until some rows have been measured, then their average) until they are.
export const ESTIMATED_ROW_HEIGHT = 42;
export const GROUP_HEADER_HEIGHT = 40;
export const MIN_HEADER_HEIGHT = 40;
export const OVERSCAN = 20;

// Deliverable Name is not shown on any sheet (the "All" tab included). The data
// stays on the row; only the column is left out.
const ALWAYS_EXCLUDED_COLUMNS = ["Deliverable Name"];
const EXCLUDED_BY_SHEET = {};
export const excludedColumnsFor = (sheetKey) => {
  if (!EXCLUDED_BY_SHEET[sheetKey]) {
    EXCLUDED_BY_SHEET[sheetKey] = [...ALWAYS_EXCLUDED_COLUMNS, ...(SHEET_EXCLUDED_COLUMNS[sheetKey] || [])];
  }
  return EXCLUDED_BY_SHEET[sheetKey];
};
