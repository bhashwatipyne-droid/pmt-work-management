// Mirrors backend `apply_time_rules` (backend/server.py). The backend is the
// source of truth - it validates, auto-fills and enforces. These helpers only
// let the worksheet flag a missing time and refuse an obviously bad value
// before a request is made.
//
// Time (minutes) feeds the efficiency formula (Non-Core minutes are subtracted
// from a month's working hours), so it has to be a sane number: finite, never
// negative, never more than 24 hours for one row.

export const MAX_ROW_MINUTES = 1440;

// Moving a row into one of these statuses needs time > 0. Reviewer statuses
// (Changes Requested / Rework / Closed) are intentionally not gated.
export const TIME_GATED_STATUSES = ["Ongoing", "Ready for Review"];

export const TIME_REQUIRED_MESSAGE =
  "Please enter the time taken (in minutes) before moving this row forward.";

export const hasTime = (item) => Number(item?.time_taken_minutes) > 0;

// A row needs time as soon as it has a deliverable type or has moved past
// "Not Started" - blank draft rows and closed history are not nagged.
export const isTimeRequired = (item) =>
  item?.status !== "Closed" &&
  (Boolean(item?.deliverable_type) || TIME_GATED_STATUSES.includes(item?.status));

export const isTimeMissing = (item) => isTimeRequired(item) && !hasTime(item);

// Result of checking what a person typed into a time box.
//   blank  -> ok, 0   (the server turns 0 back into the benchmark when one exists)
//   number -> ok, rounded to 2 decimals
//   else   -> not ok, with a message to show
export const parseTimeInput = (raw) => {
  const text = String(raw ?? "").trim();
  if (text === "") return { ok: true, minutes: 0 };

  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) {
    return { ok: false, message: "Time must be a number of minutes (0 or more)." };
  }
  if (value > MAX_ROW_MINUTES) {
    return {
      ok: false,
      message: "Time for one row cannot exceed 24 hours (1440 minutes).",
    };
  }
  return { ok: true, minutes: Math.round(value * 100) / 100 };
};

// What to show beside the time box:
//   auto   -> filled from the person's own benchmark for this deliverable type
//   edited -> typed by a person and different from that benchmark (edge case)
//   null   -> nothing to say
export const timeBadge = (item) => {
  const benchmark = Number(item?.time_benchmark_minutes) || 0;
  if (!hasTime(item)) return null;
  if (item?.time_source === "auto" && benchmark > 0) {
    return { kind: "auto", benchmark };
  }
  if (benchmark > 0 && Math.abs(Number(item.time_taken_minutes) - benchmark) >= 0.01) {
    return { kind: "edited", benchmark };
  }
  return null;
};