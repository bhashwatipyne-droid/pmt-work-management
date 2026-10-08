import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { avatarColorClasses } from "@/lib/avatarColors";

// Pick several teammates to tag on one or more entries. Each tagged person gets
// their own row (the server does the copying and refuses to add the same
// person to the same entry twice), so this only collects ids.
//
//   people     [{ id, name, department }]  who can be picked
//   addedIds   people already on the entry: shown ticked and locked
//   onSubmit   async (ids) => { problems?: [{ id?, text }] } | void.
//              Resolving with no problems closes the popover. Problems (a
//              person who already has the entry, another team, ...) are shown
//              inline and the popover stays open; throwing an Error shows its
//              message inline too.
//   blockedReason  when set, shown inline and adding is disabled (e.g. the
//              entry is still blank)
//   children   the button that opens the popover
const initialsOf = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

export function CollaboratorPicker({
  people = [],
  addedIds = [],
  onSubmit,
  children,
  title = "Add collaborators",
  hint = "Each person gets their own row to add their time.",
  align = "start",
  side,
  disabled = false,
  blockedReason = "",
  testId = "worksheet-collaborator-picker",
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  // Inline guardrail messages from the last attempt.
  const [problems, setProblems] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setSearch("");
      setPicked(new Set());
      setProblems([]);
      setError("");
    }
  }, [open]);

  const problemById = useMemo(() => {
    const map = new Map();
    problems.forEach((p) => p.id && map.set(p.id, p.text));
    return map;
  }, [problems]);
  const generalProblems = problems.filter((p) => !p.id);

  const added = useMemo(() => new Set(addedIds), [addedIds]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = needle
      ? people.filter((p) => (p.name || "").toLowerCase().includes(needle))
      : people;
    // People already on the entry sink to the bottom.
    return [...list].sort(
      (a, b) => Number(added.has(a.id)) - Number(added.has(b.id))
    );
  }, [people, search, added]);

  const selectable = visible.filter((p) => !added.has(p.id));
  const allVisiblePicked =
    selectable.length > 0 && selectable.every((p) => picked.has(p.id));

  const toggle = (id) => {
    setProblems((current) => current.filter((p) => p.id !== id));
    setError("");
    toggleId(id);
  };

  const toggleId = (id) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setPicked((current) => {
      const next = new Set(current);
      if (allVisiblePicked) selectable.forEach((p) => next.delete(p.id));
      else selectable.forEach((p) => next.add(p.id));
      return next;
    });

  const submit = async () => {
    if (!picked.size || busy || blockedReason) return;
    setBusy(true);
    setProblems([]);
    setError("");
    try {
      const result = await onSubmit?.([...picked]);
      if (result?.problems?.length) {
        setProblems(result.problems);
        // Whoever was added drops out of the picks; the rest stay for a retry.
        const refused = new Set(result.problems.map((p) => p.id).filter(Boolean));
        setPicked((current) => new Set([...current].filter((id) => refused.has(id))));
      } else {
        setOpen(false);
      }
    } catch (e) {
      setError(e?.message || "Could not add collaborators. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && !busy && setOpen(next)}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>

      <PopoverContent
        align={align}
        side={side}
        sideOffset={6}
        data-testid={testId}
        className="w-[300px] p-0"
        // Typing here must not drive the sheet's own keyboard navigation.
        onKeyDown={(event) => {
          if (event.key !== "Escape") event.stopPropagation();
        }}
      >
        <div className="border-b border-slate-100 px-3 pb-2 pt-3">
          <div className="text-[13px] font-semibold text-slate-800">{title}</div>
          {hint && <div className="mt-0.5 text-[11px] leading-4 text-slate-500">{hint}</div>}
          <div className="relative mt-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people..."
              data-testid={`${testId}-search`}
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-7 pr-2 text-[12px] outline-none focus:border-[#2b2bb5]"
            />
          </div>
        </div>

        {(blockedReason || error || generalProblems.length > 0) && (
          <div
            role="alert"
            data-testid={`${testId}-error`}
            className="space-y-0.5 border-b border-rose-100 bg-rose-50 px-3 py-2 text-[11px] leading-4 text-rose-700"
          >
            {blockedReason && <p>{blockedReason}</p>}
            {error && <p>{error}</p>}
            {generalProblems.map((p, i) => (
              <p key={i}>{p.text}</p>
            ))}
          </div>
        )}

        <div className="max-h-[240px] overflow-y-auto py-1">
          {visible.length === 0 && (
            <div className="px-3 py-4 text-center text-[12px] text-slate-400">
              {people.length === 0 ? "No one else can be added to this." : "No people found."}
            </div>
          )}

          {visible.map((person) => {
            const isAdded = added.has(person.id);
            const isPicked = isAdded || picked.has(person.id);
            return (
              <label
                key={person.id}
                className={`flex items-center gap-2 px-3 py-1.5 text-[13px] ${
                  isAdded ? "cursor-default opacity-60" : "cursor-pointer hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isPicked}
                  disabled={isAdded}
                  onChange={() => toggle(person.id)}
                  data-testid={`${testId}-option-${person.id}`}
                  className="h-3.5 w-3.5 shrink-0 accent-[#2b2bb5]"
                />
                <span
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColorClasses(person.id)}`}
                >
                  {initialsOf(person.name)}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-700">{person.name}</span>
                {problemById.has(person.id) ? (
                  <span
                    role="alert"
                    data-testid={`${testId}-problem-${person.id}`}
                    className="max-w-[120px] text-right text-[11px] leading-3 text-rose-600"
                  >
                    {problemById.get(person.id)}
                  </span>
                ) : isAdded ? (
                  <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500">
                    <Check className="h-3 w-3" /> Added
                  </span>
                ) : (
                  person.department && (
                    <span className="text-[11px] text-slate-400">{person.department}</span>
                  )
                )}
              </label>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
          <button
            type="button"
            onClick={toggleAllVisible}
            disabled={selectable.length === 0}
            className="text-[12px] font-medium text-[#2b2bb5] hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
          >
            {allVisiblePicked ? "Clear all" : "Select all"}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!picked.size || busy || Boolean(blockedReason)}
            data-testid={`${testId}-submit`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#2b2bb5] px-3 text-[12px] font-medium text-white hover:bg-[#1a1a8a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {picked.size ? `Add ${picked.size} ${picked.size === 1 ? "person" : "people"}` : "Add"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}