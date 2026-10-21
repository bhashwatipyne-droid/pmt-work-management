import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { BADGE, initials } from "./projectDetailView";

// Small building blocks of the project page.

export const Dot = ({ color, size = 8 }) => (
  <span
    className="shrink-0 rounded-full"
    style={{ width: size, height: size, background: color }}
  />
);

export const Badge = ({ color = "Neutral", children }) => {
  const c = BADGE[color] || BADGE.Neutral;
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 font-['Manrope','Inter',sans-serif] text-[10px] leading-4"
      style={{
        background: c.bg,
        color: c.fg,
        boxShadow: `inset 0 0 0 1px ${c.ring}`,
      }}
    >
      <Dot color={c.dot} size={6} />
      <span>{children}</span>
    </span>
  );
};

export const CountPill = ({ children, className = "" }) => (
  <span
    className={`rounded-full bg-[rgb(245,246,248)] font-['Manrope','Inter',sans-serif] text-[11px] font-medium leading-4 text-[rgb(74,88,120)] ${className}`}
  >
    {children}
  </span>
);

export const Avatar = ({ name, size = 24 }) => (
  <span
    className="shrink-0 rounded-full bg-[rgb(240,240,253)] text-center font-['Manrope','Inter',sans-serif] text-[10px] font-semibold text-[rgb(26,26,138)]"
    style={{ width: size, height: size, lineHeight: `${size}px` }}
  >
    {initials(name)}
  </span>
);

// The deliverable name, editable in place (admins). Saves on Enter or when
// focus leaves; Esc puts the old name back. Clicks and keys stay inside the
// input so they don't also open the row's edit modal.
export const DeliverableNameInput = ({ name, onSave }) => {
  const [value, setValue] = useState(name);
  const cancelled = useRef(false);

  useEffect(() => setValue(name), [name]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setValue(name);
      return;
    }
    const next = value.trim();
    if (!next) {
      setValue(name);
      return;
    }
    if (next !== name) onSave(next);
  };

  return (
    <input
      aria-label="Deliverable name"
      value={value}
      title={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      className="-ml-1.5 box-border h-[26px] w-full cursor-text truncate rounded-md border-none bg-transparent px-1.5 text-sm font-medium leading-[18px] text-[rgb(13,27,62)] outline-none hover:shadow-[inset_0_0_0_1px_rgb(239,240,242)] focus:bg-white focus:shadow-[inset_0_0_0_1px_rgb(43,43,181),0_0_0_3px_rgb(220,220,248)]"
    />
  );
};

export const GroupHeader = ({ open, onToggle, dot, name, meta }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={open}
    className="flex h-10 w-full items-center gap-2 bg-white pl-2.5 pr-4 text-left shadow-[inset_0_-1px_0_rgb(234,238,244)] hover:bg-[rgb(249,250,251)]"
  >
    {open ? (
      <ChevronDown className="h-4 w-4 text-[rgb(84,100,144)]" />
    ) : (
      <ChevronRight className="h-4 w-4 text-[rgb(84,100,144)]" />
    )}
    {dot && <Dot color={dot} />}
    <span className="text-[13px] font-semibold text-[rgb(13,27,62)]">{name}</span>
    <CountPill className="px-2 py-0.5">{meta}</CountPill>
  </button>
);
