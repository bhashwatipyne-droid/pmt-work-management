// Shared "Sort by" logic for the Projects page - the same three options and
// the same comparator drive both the Kanban (card) view and the list view,
// so the two never disagree about what "sorted by deadline" means.

export const SORT_OPTIONS = [
  { value: "updated", label: "Last updated" },
  { value: "deadline", label: "Deadline" },
  { value: "stage", label: "Per stage" },
];

export const DEFAULT_SORT = "updated";

// Where a project sits in the Content -> Design -> Animate pipeline: the
// furthest stage that has at least one deliverable currently in it. A
// project with no deliverables yet (or none of the three counts populated)
// sorts after everything that has started.
const stageRank = (project) => {
  const counts = project.stage_counts || {};
  if (Number(counts.Animate) > 0) return 2;
  if (Number(counts.Design) > 0) return 1;
  if (Number(counts.Content) > 0) return 0;
  return 3;
};

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

export const sortProjects = (projects, sortBy) => {
  const list = [...projects];

  if (sortBy === "deadline") {
    // Soonest due date first - the ones that need attention next.
    list.sort((a, b) => compareDateAsc(a.end_date, b.end_date));
  } else if (sortBy === "stage") {
    list.sort((a, b) => {
      const diff = stageRank(a) - stageRank(b);
      if (diff !== 0) return diff;
      // Tie-break within the same stage by deadline, so "Per stage" still
      // gives a stable, useful order among projects at the same point.
      return compareDateAsc(a.end_date, b.end_date);
    });
  } else {
    // "updated" (also the default): most recently touched first.
    list.sort((a, b) => (time(b.updated_at) || 0) - (time(a.updated_at) || 0));
  }

  return list;
};