import { ShieldCheck, UserCheck, Users } from "lucide-react";
import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from "date-fns";

// Columns and small formatting helpers for the Approvals page.

export const COLUMNS = [
  {
    key: "MANAGER",
    label: "Manager",
    icon: Users,
    description: "Internal manager sign-off",
  },
  {
    key: "LEADERSHIP",
    label: "Leadership",
    icon: ShieldCheck,
    description: "Leadership review",
  },
  {
    key: "CLIENT_SPOC",
    label: "Client SPOC",
    icon: UserCheck,
    description: "Client sign-off",
  },
  {
    key: "COMPLIANCE",
    label: "Compliance",
    icon: ShieldCheck,
    description: "Compliance review",
  },
];

export const initialBoard = () =>
  Object.fromEntries(COLUMNS.map((column) => [column.key, []]));

export const ageLabel = (isoDate) => {
  if (!isoDate) return "—";
  try {
    return `${formatDistanceToNowStrict(parseISO(isoDate))} ago`;
  } catch {
    return "—";
  }
};

// Due-date chip: replaces the plain "Pending" label with how close the
// current stage's deadline is. Falls back to "Pending" when there is none.
export const dueChip = (isoDate) => {
  const fallback = {
    label: "Pending",
    cls: "bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  };
  if (!isoDate) return fallback;
  try {
    const due = parseISO(String(isoDate).slice(0, 10));
    const days = differenceInCalendarDays(due, new Date());
    if (Number.isNaN(days)) return fallback;
    if (days < 0) {
      return { label: `Overdue · ${Math.abs(days)}d`, cls: "bg-red-50 text-red-700", dot: "bg-red-500" };
    }
    if (days === 0) return { label: "Due today", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
    if (days === 1) return { label: "Due tomorrow", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500" };
    return { label: `Due ${format(due, "EEE d MMM")}`, cls: "bg-slate-100 text-slate-600", dot: "bg-slate-400" };
  } catch {
    return fallback;
  }
};

export const deadlineText = (isoDate) => {
  if (!isoDate) return "—";
  try {
    const due = parseISO(String(isoDate).slice(0, 10));
    const days = differenceInCalendarDays(due, new Date());
    const text = format(due, "EEE, d MMM");
    if (days === 0) return `Today · ${text}`;
    if (days === 1) return `Tomorrow · ${text}`;
    return text;
  } catch {
    return "—";
  }
};

export const isEditableTarget = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
};

// Shortcuts need Ctrl (Windows/Linux) or Cmd (Mac) held down. Plain letters
// used to trigger them, and people typing or just resting on the keyboard
// approved or sent back items by accident.
export const IS_MAC =
  typeof navigator !== "undefined" &&
  /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");
export const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl";

export const KBD_CLASS =
  "inline-flex h-[18px] items-center rounded px-[5px] text-[10px] font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(234,238,244,1)]";

// One row of the queue list. Memoised so ticking a checkbox (or moving the
// highlight) re-renders only the rows whose own state changed, not all of the
// hundreds in the queue - that was most of the input lag on bulk selection.
