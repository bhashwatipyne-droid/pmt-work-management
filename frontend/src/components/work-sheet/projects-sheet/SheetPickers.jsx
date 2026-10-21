import { useState } from "react";
import { Check, ChevronLeft, Search } from "lucide-react";
import { C, MENU_ITEM, MENU_LABEL } from "./sheetTheme";
import { Avatar, Checkbox } from "./SheetBits";
import { THREE_TEAMS } from "./sheetColumns";
import { makeMatcher } from "@/lib/search";

export function SearchField({ value, onChange, placeholder, autoFocus = true, onKeyDown }) {
  return (
    <label
      className="flex h-8 items-center gap-2 rounded-[7px] px-2.5 text-[#546490]"
      style={{ boxShadow: `inset 0 0 0 1px ${C.n200}` }}
    >
      <Search className="h-3.5 w-3.5 shrink-0" />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#0d1b3e] outline-none placeholder:text-[#8a97b5]"
      />
    </label>
  );
}


// "Show rows where <field> is" - the value list of the redesign's filter popover.
export function ValuesPanel({ title, values, selected, onToggle, onClear, onDone, onBack }) {
  const [q, setQ] = useState("");
  const match = makeMatcher(q);
  const shown = values.filter((v) => match(v.label));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1.5 px-2.5 pb-1.5 pt-2.5">
        {onBack && (
          <button
            type="button"
            aria-label="Back"
            onClick={onBack}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#4a5878] hover:bg-[#f5f6f8]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <span className="font-semibold">Show rows where {title.toLowerCase()} is</span>
      </div>
      <div className="px-2.5 pb-2">
        <SearchField value={q} onChange={setQ} placeholder={`Search ${title.toLowerCase()}`} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-1.5 pb-1.5">
        {shown.map((v) => {
          const on = selected.includes(v.value);
          return (
            <button
              key={v.value}
              type="button"
              role="menuitemcheckbox"
              aria-checked={on}
              onClick={() => onToggle(v.value)}
              className="flex min-h-8 items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-left text-[13px] hover:bg-[#f0f0fd]"
            >
              <Checkbox on={on} />
              <span className="flex-1 leading-[18px]">{v.label}</span>
              <span className="text-[12px] text-[#546490]">{v.count}</span>
            </button>
          );
        })}
        {!shown.length && <div className="p-4 text-center text-[12px] text-[#546490]">No values match</div>}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-2" style={{ boxShadow: `inset 0 1px 0 ${C.cellLine}` }}>
        <span className="flex-1 text-[12px] text-[#546490]">
          {selected.length ? `${selected.length} selected` : "All values shown"}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="h-7 rounded-[7px] px-2.5 text-[12px] font-medium text-[#4a5878] hover:bg-[#f5f6f8]"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-8 rounded-[7px] bg-[#2b2bb5] px-3.5 text-[13px] font-semibold text-white hover:bg-[#3d3dcc]"
        >
          Done
        </button>
      </div>
    </div>
  );
}

// Single choice list for Task type / Client / Tracking status cells.
export function OptionList({ options, value, onPick, searchable }) {
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const match = makeMatcher(q);
  const shown = options.filter((o) => match(o.label));
  return (
    <div className="flex min-h-0 flex-col">
      {searchable && (
        <div className="p-2 pb-1">
          <SearchField
            value={q}
            onChange={(v) => {
              setQ(v);
              setHi(0);
            }}
            placeholder="Search"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((i) => Math.min(shown.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && shown[hi]) {
                e.preventDefault();
                onPick(shown[hi].value);
              }
            }}
          />
        </div>
      )}
      <div className="flex max-h-[300px] flex-col gap-px overflow-y-auto p-1.5">
        {shown.map((o, i) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onPick(o.value)}
            className={`${MENU_ITEM} ${i === hi && searchable && q ? "bg-[#f0f0fd]" : ""}`}
          >
            {o.render || <span className="flex-1 truncate">{o.label}</span>}
            {o.render && <span className="flex-1" />}
            {o.value === value && <Check className="h-3.5 w-3.5 text-[#2b2bb5]" />}
          </button>
        ))}
        {!shown.length && <div className="p-4 text-center text-[12px] text-[#546490]">No matches</div>}
      </div>
    </div>
  );
}

// Stakeholder: tick people; the first one ticked is the owner.
export function PeoplePicker({ task, users, onSave }) {
  const [q, setQ] = useState("");
  const ids = [task.owner_id, ...(task.collaborator_ids || [])].filter(Boolean);
  const match = makeMatcher(q);
  const list = (q.trim() ? users.filter((u) => match(u.name)) : users).slice(0, 80);
  const toggle = (id) => {
    const on = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    const owner = on.includes(task.owner_id) ? task.owner_id : on[0] || null;
    onSave({ owner_id: owner, collaborator_ids: on.filter((x) => x !== owner) });
  };
  return (
    <div className="flex min-h-0 flex-col">
      <div className="p-2 pb-1">
        <SearchField value={q} onChange={setQ} placeholder="Search people" />
      </div>
      <div className="flex max-h-[300px] flex-col gap-px overflow-y-auto p-1.5">
        {list.map((u) => (
          <button key={u.id} type="button" onClick={() => toggle(u.id)} className={MENU_ITEM}>
            <Checkbox on={ids.includes(u.id)} />
            <Avatar name={u.name} />
            <span className="min-w-0 flex-1 truncate">{u.name}</span>
            {u.id === task.owner_id && <span className="text-[11px] font-semibold text-[#2b2bb5]">Owner</span>}
          </button>
        ))}
      </div>
      <p className="px-3.5 pb-2.5 text-[11px] text-[#546490]">The first person ticked is the owner.</p>
    </div>
  );
}

// Follow-up with: teams, people, and anyone not in the app (free text).
export function FollowUpPicker({ task, users, teams, onSave }) {
  const chosenTeams = task.follow_up_teams || [];
  const chosenPeople = task.follow_up_user_ids || [];
  const [others, setOthers] = useState(task.follow_up_others || "");
  const allThree = THREE_TEAMS.every((t) => chosenTeams.includes(t));
  const toggleTeam = (team) =>
    onSave({ follow_up_teams: chosenTeams.includes(team) ? chosenTeams.filter((t) => t !== team) : [...chosenTeams, team] });
  const togglePerson = (id) =>
    onSave({ follow_up_user_ids: chosenPeople.includes(id) ? chosenPeople.filter((p) => p !== id) : [...chosenPeople, id] });
  const saveOthers = () => {
    if (others.trim() !== (task.follow_up_others || "").trim()) onSave({ follow_up_others: others.trim() });
  };
  return (
    <div className="flex max-h-[440px] min-h-0 flex-col overflow-y-auto p-1.5">
      <button
        type="button"
        onClick={() =>
          onSave({
            follow_up_teams: allThree
              ? chosenTeams.filter((t) => !THREE_TEAMS.includes(t))
              : [...new Set([...chosenTeams, ...THREE_TEAMS])],
          })
        }
        className={`${MENU_ITEM} font-semibold`}
      >
        <Checkbox on={allThree} />
        All 3 teams
      </button>
      <div className={MENU_LABEL}>Teams</div>
      {teams.map((t) => (
        <button key={t} type="button" onClick={() => toggleTeam(t)} className={MENU_ITEM}>
          <Checkbox on={chosenTeams.includes(t)} />
          {t}
        </button>
      ))}
      <div className={MENU_LABEL}>People</div>
      <div className="flex max-h-40 flex-col gap-px overflow-y-auto">
        {users.map((u) => (
          <button key={u.id} type="button" onClick={() => togglePerson(u.id)} className={MENU_ITEM}>
            <Checkbox on={chosenPeople.includes(u.id)} />
            <Avatar name={u.name} />
            <span className="truncate">{u.name}</span>
          </button>
        ))}
      </div>
      <div className={MENU_LABEL}>Others (not in PMT)</div>
      <div className="px-1 pb-1">
        <input
          value={others}
          onChange={(e) => setOthers(e.target.value)}
          onBlur={saveOthers}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              saveOthers();
            }
          }}
          placeholder="e.g. Printing vendor"
          className="h-8 w-full rounded-[7px] border-0 px-2.5 text-[13px] outline-none"
          style={{ boxShadow: `inset 0 0 0 1px ${C.n200}` }}
        />
      </div>
    </div>
  );
}

// The full text of a long cell, edited in a larger box (the redesign's
// "Expand cell").
export function ExpandEditor({ value, onSave, readOnly }) {
  const [draft, setDraft] = useState(value || "");
  return (
    <div className="flex flex-col gap-2 p-2.5">
      <textarea
        autoFocus
        readOnly={readOnly}
        value={draft}
        rows={6}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => !readOnly && draft.trim() !== (value || "").trim() && onSave(draft.trim())}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="w-full resize-none rounded-[7px] border-0 p-2.5 text-[13px] leading-[18px] text-[#0d1b3e] outline-none"
        style={{ boxShadow: `inset 0 0 0 1px ${C.n200}` }}
      />
      {!readOnly && <span className="text-[11px] text-[#546490]">Saves when you click away · Ctrl+Enter</span>}
    </div>
  );
}
