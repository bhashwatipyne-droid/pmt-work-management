import { memo, useMemo, useState } from "react";
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
export const FilterMultiSelect = memo(function FilterMultiSelect({
  label,
  filterKey,
  values,
  selected,
  onChange,
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search) return values;
    const needle = search.toLowerCase();
    return values.filter((value) =>
      (value.label || "").toLowerCase().includes(needle)
    );
  }, [values, search]);

  const toggle = (value) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(filterKey, next);
  };

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
          <label
            key={value.value}
            className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={selected.includes(value.value)}
              onChange={() => toggle(value.value)}
              className="mt-0.5 shrink-0"
            />

            <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">
              {value.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
});