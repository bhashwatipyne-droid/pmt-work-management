// Shared "Sort by" logic for the Projects page - the same three options and
// the same comparator drive both the Kanban (card) view and the list view,
// so the two never disagree about what "sorted by deadline" means.

export const SORT_OPTIONS = [
  { value: "", label: "No sorting" },
  { value: "added", label: "Latest added" },
  { value: "updated", label: "Last updated" },
  { value: "deadline", label: "Deadline" },
  { value: "no_deliverables", label: "No deliverables first" },
  { value: "has_deliverables", label: "Has deliverables first" },
  { value: "lookalikes", label: "Look-alikes first" },
];

// "" ("No sorting") is the default - the card view keeps its manual drag
// order and the list view keeps whatever order the API returned, until the
// person explicitly picks a criterion.
export const DEFAULT_SORT = "";

const time = (value) => {
  const ms = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
};

// Missing dates always sort last, whichever direction is requested - a
// project with no due date is neither "the soonest" nor "the latest".
const compareDate = (a, b, direction = 1) => {
  const ta = time(a);
  const tb = time(b);
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  return (ta - tb) * direction;
};

// `sortBy === ""` (or any value this doesn't recognize) leaves the list
// exactly as given - callers that want "No sorting" to mean the board's own
// manual drag order should pass the list in that order already (see
// ProjectsPage.jsx's byStatus, which falls back to kanban_order itself
// rather than calling this function at all when sortBy is empty).
//
// `context.lookalikeKeyById` (project id -> a key shared by names that look
// alike) is what the "Look-alikes first" sort needs; the page builds it from
// the same look-alike check that puts "Looks like ..." on the cards.
// Every sort here is stable: projects the criterion can't tell apart keep the
// order they came in.
export const sortProjects = (projects, sortBy, context = {}) => {
  const list = [...projects];

  if (sortBy === "deadline") {
    // Latest due date first (descending) - projects with no due date still
    // sort to the end either way.
    list.sort((a, b) => compareDate(a.end_date, b.end_date, -1));
  } else if (sortBy === "added") {
    // Newest created project first. created_at is set once, when the project
    // is made, so this differs from "Last updated" (which moves on any edit).
    list.sort((a, b) => (time(b.created_at) || 0) - (time(a.created_at) || 0));
  } else if (sortBy === "updated") {
    list.sort((a, b) => (time(b.updated_at) || 0) - (time(a.updated_at) || 0));
  } else if (sortBy === "no_deliverables" || sortBy === "has_deliverables") {
    // Projects with nothing in them (an empty project, or one whose
    // deliverables ended up somewhere else) against the ones that have some.
    const has = (project) => (Number(project.deliverables_count) > 0 ? 1 : 0);
    const direction = sortBy === "has_deliverables" ? -1 : 1;
    list.sort((a, b) => (has(a) - has(b)) * direction);
  } else if (sortBy === "lookalikes") {
    // Projects flagged "Looks like ..." first, grouped so the ones that look
    // like each other sit next to each other; unflagged projects follow.
    const keys = context.lookalikeKeyById;
    const keyOf = (project) => keys?.get(project.id) ?? null;
    list.sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (ka === null && kb === null) return 0;
      if (ka === null) return 1;
      if (kb === null) return -1;
      return ka.localeCompare(kb);
    });
  }

  return list;
};