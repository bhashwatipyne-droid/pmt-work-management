export const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
// Dates in cells read like the other sheets: 15-10-2026.
export const sheetDate = (day) => (day ? day.split("-").reverse().join("-") : "");
export const daysBetween = (a, b) => Math.round((new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`)) / 864e5);
export const shortDate = (day) =>
  day ? new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "";
export const initials = (name = "") =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

export const nextFollowUp = (t) => [t.internal_follow_up_date, t.client_follow_up_date].filter(Boolean).sort()[0] || "";
export const lateBy = (t, day) => {
  if (t.status === "Done") return 0;
  const next = nextFollowUp(t);
  return next && next < day ? daysBetween(day, next) : 0;
};

export const isPrintable = (e) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
