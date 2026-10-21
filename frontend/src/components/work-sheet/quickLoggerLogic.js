import {
  NOT_AVAILABLE_LABEL,
  NOT_AVAILABLE_VALUE,
} from "@/lib/deliverableRules";


// Shown as the last Deliverable suggestion. Shaped like a deliverable (id /
// name) so the suggestion list, chips and keyboard handling treat it the same
// way; `notAvailable` is what tells buildEntry to save the flag instead of an
// id.
export const NOT_AVAILABLE_OPTION = {
  id: NOT_AVAILABLE_VALUE,
  name: NOT_AVAILABLE_LABEL,
  notAvailable: true,
};

export const STAGE_BY_DEPARTMENT = {
  Content: "Content",
  Design: "Design",
  Animation: "Animate",
};

export const DURATION_PRESETS = [15, 30, 45, 60, 90, 120];

export const emptyDraft = () => ({
  text: "",
  client_id: "",
  project_id: "",
  deliverable_id: "",
  deliverable_type: "",
  time_taken_minutes: "",
  remarks: "",
});

export const formatDuration = (minutes) => {
  const value = Number(minutes);
  if (!value) return "";
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
};

export const parseDuration = (value) => {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;

  const hours = text.match(/^(\d+(?:\.\d+)?)\s*h$/);
  if (hours) return Math.round(Number(hours[1]) * 60);

  const minutes = text.match(/^(\d+)\s*m?$/);
  if (minutes) return Number(minutes[1]);

  return null;
};

export const normalise = (value) =>
  String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

// No cap by default: the suggestion list scrolls (max-h-64), and cutting it to
// the first 8 hid most deliverables and types unless they were typed exactly.
export const fuzzyMatches = (items, query, getLabel, limit = Infinity) => {
  const q = normalise(query);
  if (!q) return items.slice(0, limit);

  return items
    .map((item, index) => {
      const label = normalise(getLabel(item));
      let score = 0;
      if (label === q) score = 100;
      else if (label.startsWith(q)) score = 80;
      else if (label.includes(q)) score = 60;
      else if (q.split(" ").every((word) => label.includes(word))) score = 40;
      return { item, score, index };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.item);
};
