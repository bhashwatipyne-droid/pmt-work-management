// Shared "Sort by" logic for the Projects page - the same three options and
// the same comparator drive both the Kanban (card) view and the list view,
// so the two never disagree about what "sorted by deadline" means.

export const SORT_OPTIONS = [
  { value: "", label: "No sorting" },
  { value: "updated", label: "Last updated" },
  { value: "deadline", label: "Deadline" },
];

// "" ("No sorting") is the default - the card view keeps its manual drag
// order and the list view keeps whatever order the API returned, until the
// person explicitly picks a criterion.
export const DEFAULT_SORT = "";

const time = (value) => {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
};

// Ascending date compare with missing dates always sorting last, regardless
// of sort direction - a project with no due date isn't "the soonest".
const compareDateAsc = (a, b) => {
  const ta = time(a);
  const tb = time(b);
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return ta - tb;
};

// `sortBy === ""` (or any value this doesn't recognize) leaves the list
// exactly as given - callers that want "No sorting" to mean the board's own
// manual drag order should pass the list in that order already (see
// ProjectsPage.jsx's byStatus, which falls back to kanban_order itself
// rather than calling this function at all when sortBy is empty).
export const sortProjects = (projects, sortBy) => {
  const list = [...projects];

  if (sortBy === "deadline") {
    // Soonest due date first - the ones that need attention next.
    list.sort((a, b) => compareDateAsc(a.end_date, b.end_date));
  } else if (sortBy === "updated") {
    list.sort((a, b) => (time(b.updated_at) || 0) - (time(a.updated_at) || 0));
  }

  return list;
};