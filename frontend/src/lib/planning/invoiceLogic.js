// Small helpers for the Ready to invoice screens: the three billing categories,
// time formatting, and the colour of the "waiting" pill.

export const INV_CATS = [
  { key: "Content", icon: "document", tint: "var(--brand-50)", fg: "var(--brand-700)" },
  { key: "Design", icon: "palette", tint: "var(--success-100)", fg: "rgb(0,91,75)" },
  { key: "Animation", icon: "film", tint: "var(--warning-100)", fg: "rgb(146,64,14)" },
];

export const hm = (m) => {
  const total = Math.round(m || 0);
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return (h ? h + "h" : "") + (h && mm ? " " : "") + (mm || !h ? mm + "m" : "");
};

export const shortDate = (iso) => {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "–"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

export const waitText = (days) => (days <= 0 ? "Today" : days === 1 ? "1 day" : days + " days");

export const waitTone = (days, raised) =>
  raised
    ? { bg: "var(--neutral-100)", fg: "var(--neutral-500)" }
    : days > 20
      ? { bg: "var(--error-50)", fg: "rgb(153,27,27)" }
      : days > 10
        ? { bg: "var(--warning-100)", fg: "rgb(146,64,14)" }
        : { bg: "var(--neutral-100)", fg: "var(--neutral-700)" };
