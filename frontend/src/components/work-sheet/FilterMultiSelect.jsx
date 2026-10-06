import { memo, useCallback, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "../ui/input";

// Memoized so that editing one filter (e.g. checking a Creator box)
// doesn't force every other unrelated MultiSelect in the same panel to
// re-filter and re-render its own (potentially long) list. This only
// works if EVERY prop stays referentially stable across unrelated
// updates — including `onChange`. That's why this takes `filterKey` +
// a shared `onChange(filterKey, value)` dispatcher instead of a
// pre-bound `onChange(value)` closure: a closure like
// `(v) => update("project_ids", v)` is a brand-new function on every
// parent render, which makes React.memo bail out and re-render
// every list on every single checkbox click regardless of the
// `values`/`selected` memoization — this was the actual remaining
// cause of the multi-second lag.
// A deliverable list can hold thousands of names. Rendering every one as a
// checkbox made each tick re-render thousands of rows and freeze the page
// (and the open menu "danced" while it caught up). Only the first MAX_VISIBLE
// matches are drawn, plus anything already ticked; typing in the search box
// narrows the rest. The order never changes when an option is ticked.
const MAX_VISIBLE = 100;

const OptionRow = memo(function OptionRow({ value, label, checked, onToggle }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(value)}
        className="mt-0.5 shrink-0"
      />

      <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">
        {label}
      </span>
    </label>
  );
});

export const FilterMultiSelect = memo(function FilterMultiSelect({
  label,
  filterKey,
  values,
  selected,
  onChange,
}) {
  const [search, setSearch] = useState("");

  const { rows: filtered, hiddenCount } = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matches = needle
      ? values.filter((value) =>
          (value.label || "").toLowerCase().includes(needle)
        )
      : values;

    if (matches.length <= MAX_VISIBLE) {
      return { rows: matches, hiddenCount: 0 };
    }

    const ticked = new Set(selected);
    const rows = matches.filter(
      (value, index) => index < MAX_VISIBLE || ticked.has(value.value)
    );
    return { rows, hiddenCount: matches.length - rows.length };
  }, [values, search, selected]);

  const toggle = useCallback(
    (value) => {
      const next = selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value];
      onChange(filterKey, next);
    },
    [selected, onChange, filterKey]
  );

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  return (
    <div className="space-y-2">
      {label && (
        <div className="text-xs font-semibold text-slate-700">{label}</div>
      )}

      {values.length > 6 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${(label || "").toLowerCase()}...`}
            className="h-8 pl-8 text-xs"
          />
        </div>
      )}

      <div className="max-h-64 space-y-1 overflow-y-auto">
        {filtered.map((value) => (
          <OptionRow
            key={value.value}
            value={value.value}
            label={value.label}
            checked={selectedSet.has(value.value)}
            onToggle={toggle}
          />
        ))}

        {hiddenCount > 0 && (
          <div className="px-2 py-1.5 text-[11px] text-slate-400">
            {hiddenCount} more not shown. Type in the search box to find them.
          </div>
        )}
      </div>
    </div>
  );
});