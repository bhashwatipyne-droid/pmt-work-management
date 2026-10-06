// Qty column helpers. A Design or Animate row can stand for several units (a
// 23-slide deck is ONE row with quantity 23). The per-unit minutes live in
// `quantity_items`; when any are logged the row's Time is their total.
// Mirrors apply_quantity_rules in backend/server.py, which is the source of
// truth - these only let the sheet explain a problem before a request is made.

export const QUANTITY_STAGES = ["Design", "Animate"];
export const MAX_QUANTITY = 200;
export const MAX_UNIT_MINUTES = 1440;

export const qtyApplies = (item) => QUANTITY_STAGES.includes(item?.stage);
export const durationApplies = (item) => item?.stage === "Animate";

export const quantityOf = (item) => {
  const n = Math.round(Number(item?.quantity) || 1);
  return Math.min(Math.max(n, 1), MAX_QUANTITY);
};

// The cell shows a count only once someone has entered one: every older row
// carries the default quantity of 1, which would just be noise.
export const isQtySet = (item) =>
  qtyApplies(item) &&
  (quantityOf(item) > 1 || (item?.quantity_items || []).length > 0);

// One slot per unit, padded/truncated to the current quantity.
export const itemsOf = (item) => {
  const n = quantityOf(item);
  const items = (item?.quantity_items || []).slice(0, n);
  while (items.length < n) items.push(null);
  return items;
};

export const loggedCount = (item) =>
  itemsOf(item).filter((minutes) => Number(minutes) > 0).length;

export const itemsTotal = (items) =>
  items.reduce((sum, minutes) => sum + (Number(minutes) > 0 ? Number(minutes) : 0), 0);

// "slide" / "slides", "scene" / "scenes". Animate rows count scenes; other
// types use the unit the server knows for them (Slide, Page, Reel...).
export const unitName = (item, options, count = 2) => {
  const base =
    item?.stage === "Animate"
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
