// Qty column helpers. A Design or Animate row can stand for several units (a
// 23-slide deck is ONE row with quantity 23). The per-unit minutes live in
// `quantity_items`; when any are logged the row's Time is their total.
// Mirrors apply_quantity_rules in backend/server.py, which is the source of
// truth - these only let the sheet explain a problem before a request is made.

export const QUANTITY_STAGES = ["Design", "Animate"];
export const MAX_QUANTITY = 200;
export const MAX_UNIT_MINUTES = 1440;

// Campaign ideation is done in bulk, so one Content row of a "Campaign Ideation
// Plan (...)" type can cover several projects. Its Qty is not typed: it is the
// number of projects ticked in the Project cell, and each unit in the Qty panel
// is one of those projects (quantity_items[i] is the time for project_ids[i]).
// Mirrors is_multi_project_row in backend/server.py.
export const MULTI_PROJECT_STAGE = "Content";
export const MULTI_PROJECT_TYPE_PREFIX = "Campaign Ideation Plan";

export const isMultiProjectType = (type) =>
  String(type || "").startsWith(MULTI_PROJECT_TYPE_PREFIX);

export const isMultiProjectRow = (item) =>
  item?.stage === MULTI_PROJECT_STAGE && isMultiProjectType(item?.deliverable_type);

// The projects a row covers, first one first. Rows saved before the list
// existed only have project_id.
export const projectIdsOf = (item) => {
  const ids = (item?.project_ids || []).filter(Boolean);
  if (ids.length) return ids;
  return item?.project_id ? [item.project_id] : [];
};

// The fields to send when the ticked projects change: the first becomes the
// row's project (and its client), the quantity follows the count, and each
// project keeps the time already typed for it. Mirrors apply_project_list_rules
// in backend/server.py, which is the source of truth - sending the same values
// just keeps the sheet's optimistic update from flickering.
export const projectListPatch = (item, nextIds, projects = []) => {
  const stored = projectIdsOf(item);
  const oldItems = item?.quantity_items || [];
  const byProject = new Map(stored.map((id, i) => [id, oldItems[i] ?? null]));
  const first = projects.find((p) => p.id === nextIds[0]);
  const patch = {
    project_ids: nextIds,
    project_id: nextIds[0] || null,
    quantity: Math.max(1, nextIds.length),
    quantity_items: nextIds.map((id) => byProject.get(id) ?? null),
  };
  if (first?.client_id) patch.client_id = first.client_id;
  return patch;
};

export const qtyApplies = (item) =>
  QUANTITY_STAGES.includes(item?.stage) || isMultiProjectRow(item);
export const durationApplies = (item) => item?.stage === "Animate";

export const quantityOf = (item) => {
  if (isMultiProjectRow(item)) {
    return Math.min(Math.max(projectIdsOf(item).length, 1), MAX_QUANTITY);
  }
  const n = Math.round(Number(item?.quantity) || 1);
  return Math.min(Math.max(n, 1), MAX_QUANTITY);
};

// The cell shows a count only once someone has entered one: every older row
// carries the default quantity of 1, which would just be noise.
export const isQtySet = (item) =>
  isMultiProjectRow(item)
    ? projectIdsOf(item).length > 0
    : qtyApplies(item) &&
      (quantityOf(item) > 1 || (item?.quantity_items || []).length > 0);

// One slot per unit, padded/truncated to the current quantity.
export const itemsOf = (item) => {
  const n = quantityOf(item);
  const items = (item?.quantity_items || []).slice(0, n);
  while (items.length < n) items.push(null);
  return items;
};

// Units typed by hand.
export const typedCount = (item) =>
  itemsOf(item).filter((minutes) => Number(minutes) > 0).length;

// Units that have a time: every one when the person has an efficiency
// benchmark for the type (untyped units use it), else just the typed ones.
export const loggedCount = (item) =>
  Number(item?.time_benchmark_minutes) > 0 ? quantityOf(item) : typedCount(item);

export const itemsTotal = (items) =>
  items.reduce((sum, minutes) => sum + (Number(minutes) > 0 ? Number(minutes) : 0), 0);

// "slide" / "slides", "scene" / "scenes". Animate rows count scenes; other
// types use the unit the server knows for them (Slide, Page, Reel...).
export const unitName = (item, options, count = 2) => {
  const base = isMultiProjectRow(item)
    ? "project"
    : item?.stage === "Animate"
      ? "scene"
      : String(options?.deliverable_type_units?.[item?.deliverable_type] || "item").toLowerCase();
  return count === 1 ? base : `${base}s`;
};

// 460 -> "7h 40m", 45 -> "45m", 120 -> "2h", 0 -> "0m"
export const formatMinutes = (minutes) => {
  const total = Math.round(Number(minutes) || 0);
  if (total <= 0) return "0m";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

// "20", "20m", "1h", "1h 10m", "1.5h", "90 min" -> minutes. Blank -> 0.
// Anything else -> null so the caller can say it wasn't understood.
export const parseDuration = (raw) => {
  const text = String(raw ?? "").trim().toLowerCase();
  if (text === "") return 0;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 100) / 100;

  const match = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?$/.exec(text);
  if (!match || (match[1] === undefined && match[2] === undefined)) return null;
  const minutes = Number(match[1] || 0) * 60 + Number(match[2] || 0);
  return Math.round(minutes * 100) / 100;
};

// ---- Video duration (Animate rows) -----------------------------------------
// Stored in SECONDS (video_duration_seconds). Rows saved before seconds existed
// only carry video_duration_minutes, so every read goes through durationSecondsOf.
// The server keeps both fields in step; a patch sends both so the sheet's
// optimistic update never shows a stale one.
export const MAX_DURATION_SECONDS = 24 * 60 * 60;
export const DURATION_HINT =
  "Type seconds (200), or 3m 20s, or 3:20. Up to 24 hours.";

export const durationSecondsOf = (item) => {
  if (item?.video_duration_seconds != null) {
    return Math.round(Number(item.video_duration_seconds));
  }
  if (item?.video_duration_minutes != null) {
    return Math.round(Number(item.video_duration_minutes) * 60);
  }
  return null;
};

// The fields to send for a duration (null clears it).
export const durationPatch = (seconds) => ({
  video_duration_seconds: seconds,
  video_duration_minutes: seconds == null ? null : Math.round((seconds / 60) * 100) / 100,
});

// 200 -> "3m 20s", 45 -> "45s", 120 -> "2m", 3725 -> "1h 2m 5s", 0 -> "0s",
// nothing -> "".
export const formatDurationSeconds = (seconds) => {
  if (seconds == null || seconds === "") return "";
  const total = Math.round(Number(seconds));
  if (!Number.isFinite(total) || total < 0) return "";
  if (total === 0) return "0s";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(" ");
};

// What the Duration box understands. A bare number is SECONDS:
//   "200" "200s" "3m 20s" "3m20s" "3 min 20 sec" "3:20" "1:02:05" "1h" "1.5m"
// -> { ok: true, seconds }. Blank -> { ok: true, seconds: null } (clears it).
// Anything else, or more than 24 hours -> { ok: false }.
export const parseDurationSeconds = (raw) => {
  const text = String(raw ?? "").trim().toLowerCase();
  if (text === "") return { ok: true, seconds: null };

  const done = (value) => {
    const seconds = Math.round(value);
    return Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_DURATION_SECONDS
      ? { ok: true, seconds }
      : { ok: false };
  };

  if (/^\d+(\.\d+)?$/.test(text)) return done(Number(text));

  const clock = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(text);
  if (clock) {
    const [, a, b, c] = clock;
    const hasHours = c !== undefined;
    const minutes = hasHours ? Number(b) : Number(a);
    const secs = hasHours ? Number(c) : Number(b);
    if (secs >= 60 || (hasHours && minutes >= 60)) return { ok: false };
    return done((hasHours ? Number(a) * 3600 : 0) + minutes * 60 + secs);
  }

  const parts = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?$/.exec(text);
  if (!parts || (parts[1] === undefined && parts[2] === undefined && parts[3] === undefined)) {
    return { ok: false };
  }
  return done(
    Number(parts[1] || 0) * 3600 + Number(parts[2] || 0) * 60 + Number(parts[3] || 0)
  );
};