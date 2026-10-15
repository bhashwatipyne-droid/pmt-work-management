import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { SearchableSelect } from "./SearchableSelect";
import { MonthPicker } from "./MonthPicker";
import { avatarColorClasses } from "@/lib/avatarColors";
import { makeMatcher } from "@/lib/search";
import {
  createProjectTask,
  deleteProjectTask,
  getClients,
  getProjectTasks,
  setProjectTaskUpdate,
  updateProjectTask,
} from "@/services/api";

// Work Sheet > Projects tab: the Projects team's follow-up sheet.
//
// It keeps the feel of the Google Sheet the team used: a list for each day,
// edited in the cells. The difference is that a task is one row that stays
// open until it is marked Done, so the list for a day is simply every task open
// on that day - nobody copies yesterday's rows forward. What happened on a day
// goes in that day's "Update" cell, and the previous update shows under it.
// Days late are counted from the follow-up dates instead of being typed.
//
// Not production work: none of this counts toward efficiency.

const NONE = "__none__";
const THREE_TEAMS = ["Content", "Design", "Animation"];

const STATUS_STYLE = {
  "On track": "bg-emerald-50 text-emerald-700",
  "At risk": "bg-amber-50 text-amber-700",
  "Waiting on client": "bg-slate-100 text-slate-600",
  Delayed: "bg-rose-50 text-rose-700",
  Done: "bg-emerald-50 text-emerald-700",
};

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysBetween = (a, b) => Math.round((new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`)) / 864e5);
const shortDate = (day) =>
  day ? new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "";
const initials = (name = "") =>
  name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

const nextFollowUp = (t) => [t.internal_follow_up_date, t.client_follow_up_date].filter(Boolean).sort()[0] || "";
const lateBy = (t, day) => {
  if (t.status === "Done") return 0;
  const next = nextFollowUp(t);
  return next && next < day ? daysBetween(day, next) : 0;
};

const CELL = "border-b border-r border-[#eef0f6] px-2 py-1.5 align-top text-[13px]";
const INPUT =
  "w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] outline-none hover:border-[#e2e6f0] focus:border-[#2b2bb5] focus:bg-white";

// A text cell that saves when you leave it (or press Enter), like a sheet.
function TextCell({ value, onSave, placeholder, multiline = false, className = "", disabled, ...rest }) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => setDraft(value || ""), [value]);
  const commit = () => {
    if ((draft || "").trim() !== (value || "").trim()) onSave(draft.trim());
  };
  const Tag = multiline ? "textarea" : "input";
  return (
    <Tag
      {...rest}
      value={draft}
      disabled={disabled}
      rows={multiline ? 1 : undefined}
      placeholder={placeholder}
      onChange={(e) => {
        setDraft(e.target.value);
        if (multiline) {
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          setDraft(value || "");
          e.currentTarget.blur();
        }
      }}
      className={`${INPUT} ${multiline ? "resize-none overflow-hidden leading-5" : ""} ${className}`}
    />
  );
}

function Avatar({ user, size = "h-6 w-6" }) {
  return (
    <span
      title={user?.name}
      className={`inline-grid ${size} shrink-0 place-items-center rounded-full border-2 border-white text-[10px] font-bold ${avatarColorClasses(user?.id)}`}
    >
      {initials(user?.name)}
    </span>
  );
}

// Owner + collaborators: tick people; the first one ticked is the owner.
function PeopleCell({ task, users, userById, onSave, disabled }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ids = [task.owner_id, ...(task.collaborator_ids || [])].filter(Boolean);
  const match = makeMatcher(query);
  const list = (query.trim() ? users.filter((u) => match(u.name)) : users).slice(0, 60);
  const toggle = (id) => {
    const on = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    const owner = on.includes(task.owner_id) ? task.owner_id : on[0] || null;
    onSave({ owner_id: owner, collaborator_ids: on.filter((x) => x !== owner) });
  };
  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className="flex min-h-8 w-full items-center rounded-md px-1 hover:bg-[#f5f6fb]">
          {ids.length ? (
            <span className="flex items-center">
              {ids.slice(0, 4).map((id, i) => (
                <span key={id} className={i ? "-ml-2" : ""}>
                  <Avatar user={userById.get(id) || { id, name: "?" }} />
                </span>
              ))}
              <span className="ml-1.5 truncate text-[12px] text-[#0d1b3e]">
                {userById.get(ids[0])?.name?.split(" ")[0]}
                {ids.length > 1 && <span className="text-[#546490]"> +{ids.length - 1}</span>}
              </span>
            </span>
          ) : (
            <span className="text-[12px] text-[#94a0bf]">Assign</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people"
          className="mb-1 h-8 w-full rounded-md border border-[#e2e6f0] px-2 text-[13px] outline-none focus:border-[#2b2bb5]"
        />
        <div className="max-h-64 overflow-y-auto">
          {list.map((u) => (
            <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-[#f0f0fd]">
              <input type="checkbox" checked={ids.includes(u.id)} onChange={() => toggle(u.id)} />
              <Avatar user={u} />
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              {u.id === task.owner_id && <span className="text-[11px] font-semibold text-[#2b2bb5]">Owner</span>}
            </label>
          ))}
        </div>
        <p className="px-2 pb-1 pt-1.5 text-[11px] text-[#546490]">The first person ticked is the owner.</p>
      </PopoverContent>
    </Popover>
  );
}

// Follow-up with: teams, people, and anyone not in the app (free text).
function FollowUpCell({ task, users, userById, teams, onSave, disabled }) {
  const [open, setOpen] = useState(false);
  const chosenTeams = task.follow_up_teams || [];
  const chosenPeople = task.follow_up_user_ids || [];
  const allThree = THREE_TEAMS.every((t) => chosenTeams.includes(t));
  const toggleTeam = (team) =>
    onSave({ follow_up_teams: chosenTeams.includes(team) ? chosenTeams.filter((t) => t !== team) : [...chosenTeams, team] });
  const togglePerson = (id) =>
    onSave({ follow_up_user_ids: chosenPeople.includes(id) ? chosenPeople.filter((p) => p !== id) : [...chosenPeople, id] });
  const shownTeams = allThree ? ["All 3 teams", ...chosenTeams.filter((t) => !THREE_TEAMS.includes(t))] : chosenTeams;
  const empty = !chosenTeams.length && !chosenPeople.length && !task.follow_up_others;
  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className="flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md px-1 py-1 text-left hover:bg-[#f5f6fb]">
          {shownTeams.map((t) => (
            <span key={t} className="rounded-full bg-[#f0f0fd] px-2 py-px text-[11px] font-medium text-[#1a1a8a]">{t}</span>
          ))}
          {chosenPeople.map((id) => (
            <Avatar key={id} user={userById.get(id) || { id, name: "?" }} size="h-5 w-5" />
          ))}
          {task.follow_up_others && <span className="text-[12px] text-[#0d1b3e]">{task.follow_up_others}</span>}
          {empty && <span className="text-[12px] text-[#94a0bf]">—</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] font-semibold hover:bg-[#f0f0fd]">
          <input
            type="checkbox"
            checked={allThree}
            onChange={() =>
              onSave({
                follow_up_teams: allThree
                  ? chosenTeams.filter((t) => !THREE_TEAMS.includes(t))
                  : [...new Set([...chosenTeams, ...THREE_TEAMS])],
              })
            }
          />
          All 3 teams
        </label>
        <p className="px-2 pt-1 text-[11px] font-bold uppercase tracking-wide text-[#546490]">Teams</p>
        {teams.map((t) => (
          <label key={t} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-[#f0f0fd]">
            <input type="checkbox" checked={chosenTeams.includes(t)} onChange={() => toggleTeam(t)} />
            {t}
          </label>
        ))}
        <p className="px-2 pt-2 text-[11px] font-bold uppercase tracking-wide text-[#546490]">People</p>
        <div className="max-h-40 overflow-y-auto">
          {users.map((u) => (
            <label key={u.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-[13px] hover:bg-[#f0f0fd]">
              <input type="checkbox" checked={chosenPeople.includes(u.id)} onChange={() => togglePerson(u.id)} />
              <Avatar user={u} size="h-5 w-5" />
              <span className="truncate">{u.name}</span>
            </label>
          ))}
        </div>
        <p className="px-2 pt-2 text-[11px] font-bold uppercase tracking-wide text-[#546490]">Others (not in PMT)</p>
        <div className="px-1 pb-1">
          <TextCell
            value={task.follow_up_others}
            onSave={(v) => onSave({ follow_up_others: v })}
            placeholder="e.g. Printing vendor"
            className="border-[#e2e6f0]"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function DateCell({ value, viewDay, done, onSave, disabled, label }) {
  const tone = !value || done ? "" : value < viewDay ? "text-rose-600 font-semibold" : value === viewDay ? "text-[#2b2bb5] font-semibold" : "";
  return (
    <input
      type="date"
      aria-label={label}
      disabled={disabled}
      value={value || ""}
      onChange={(e) => onSave(e.target.value || null)}
      className={`${INPUT} w-[132px] tabular-nums ${tone}`}
    />
  );
}

export function ProjectsSheet({ currentUser, users = [], projects = [], tabs }) {
  const [tasks, setTasks] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [options, setOptions] = useState({ task_types: [], statuses: [], teams: [], meeting_types: [] });
  const [clients, setClients] = useState([]);
  const [today, setToday] = useState(() => addDays(new Date().toISOString().slice(0, 10), 0));
  const [month, setMonth] = useState(null); // "2026-10"; null = this month
  const [view, setView] = useState("day");
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState("client");
  const [loading, setLoading] = useState(true);
  const [openSelect, setOpenSelect] = useState(null);
  const focusTaskRef = useRef(null);

  const canEdit = currentUser?.role !== "hr";
  // The sheet shows a month: every task open at any point in it. "Late" and
  // the Update cell work off one day of that month - today in the current
  // month, the last day of a past month, the first day of a future one.
  const viewMonth = month || today.slice(0, 7);
  const monthStart = `${viewMonth}-01`;
  const monthEnd = addDays(`${addDays(`${viewMonth}-28`, 4).slice(0, 7)}-01`, -1);
  const viewDay = today >= monthStart && today <= monthEnd ? today : today > monthEnd ? monthEnd : monthStart;
  const openInMonth = (t) => (t.start_date || "") <= monthEnd && !(t.done_date && t.done_date < monthStart);
  const doneInMonth = (t) => t.done_date && t.done_date >= monthStart && t.done_date <= monthEnd;

  const load = useCallback(() => {
    return getProjectTasks()
      .then((data) => {
        setTasks(data.tasks || []);
        setUpdates(data.updates || []);
        setOptions(data.options || {});
        if (data.today) setToday(data.today);
      })
      .catch(() => toast.error("Couldn't load the Projects sheet. Refresh to try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    getClients().then((c) => setClients(c || [])).catch(() => {});
  }, [load]);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const activeUsers = useMemo(
    () => users.filter((u) => u.active !== false).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [users]
  );
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Update notes: this day's note and the latest one before it, per task.
  const notesByTask = useMemo(() => {
    const map = new Map();
    updates.forEach((u) => {
      const list = map.get(u.task_id) || [];
      list.push(u);
      map.set(u.task_id, list);
    });
    return map;
  }, [updates]);

  const save = useCallback(
    (task, fields) => {
      const before = task;
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, ...fields } : t)));
      return updateProjectTask(task.id, { ...fields, day: viewDay })
        .then((saved) => setTasks((list) => list.map((t) => (t.id === task.id ? saved : t))))
        .catch((err) => {
          setTasks((list) => list.map((t) => (t.id === task.id ? before : t)));
          toast.error(err?.response?.data?.detail || "Couldn't save that change");
        });
    },
    [viewDay]
  );

  const saveNote = (task, note) => {
    setUpdates((list) => [
      ...list.filter((u) => !(u.task_id === task.id && u.day === viewDay)),
      ...(note ? [{ task_id: task.id, day: viewDay, note, user_id: currentUser?.id }] : []),
    ]);
    setProjectTaskUpdate(task.id, viewDay, note).catch(() => toast.error("Couldn't save the update"));
  };

  const addRow = () => {
    createProjectTask({ day: viewDay })
      .then((task) => {
        setTasks((list) => [...list, task]);
        setView("day");
        setQuery("");
        focusTaskRef.current = task.id;
      })
      .catch((err) => toast.error(err?.response?.data?.detail || "Couldn't add a row"));
  };

  const removeRow = (task) => {
    setTasks((list) => list.filter((t) => t.id !== task.id));
    deleteProjectTask(task.id)
      .then(() => toast(`Deleted "${task.task || "Untitled task"}"`))
      .catch((err) => {
        setTasks((list) => [...list, task]);
        toast.error(err?.response?.data?.detail || "Couldn't delete that row");
      });
  };

  // Put the cursor in the new row's Task cell.
  useEffect(() => {
    if (!focusTaskRef.current) return;
    const el = document.querySelector(`[data-task-input="${focusTaskRef.current}"]`);
    if (el) {
      el.focus();
      focusTaskRef.current = null;
    }
  });

  const isMeeting = (t) => (options.meeting_types || []).includes(t.task_type);

  const counts = useMemo(() => {
    const open = tasks.filter((t) => openInMonth(t) && t.status !== "Done");
    return {
      day: tasks.filter(openInMonth).length,
      due: open.filter((t) => nextFollowUp(t) && nextFollowUp(t) <= viewDay).length,
      overdue: open.filter((t) => lateBy(t, viewDay) > 0).length,
      meetings: open.filter(isMeeting).length,
      done: tasks.filter(doneInMonth).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, viewDay, options]);

  const groups = useMemo(() => {
    const match = makeMatcher(query);
    const visible = tasks.filter((t) => {
      if (query.trim()) {
        const people = [t.owner_id, ...(t.collaborator_ids || []), ...(t.follow_up_user_ids || [])]
          .map((id) => userById.get(id)?.name || "")
          .join(" ");
        if (
          !match(
            t.task,
            t.task_type,
            t.spoc,
            clientById.get(t.client_id)?.name,
            projectById.get(t.project_id)?.name,
            people,
            (t.follow_up_teams || []).join(" "),
            t.follow_up_others
          )
        )
          return false;
      }
      if (view === "done") return doneInMonth(t);
      if (!openInMonth(t)) return false;
      if (view !== "day" && t.status === "Done") return false;
      if (view === "due") return nextFollowUp(t) && nextFollowUp(t) <= viewDay;
      if (view === "overdue") return lateBy(t, viewDay) > 0;
      if (view === "meetings") return isMeeting(t);
      return true;
    });
    const keyOf = (t) =>
      groupBy === "owner"
        ? userById.get(t.owner_id)?.name || "Unassigned"
        : groupBy === "type"
          ? t.task_type || "No type"
          : clientById.get(t.client_id)?.name || "Internal";
    const map = new Map();
    visible
      .sort(
        (a, b) =>
          (a.created_at || "").localeCompare(b.created_at || "")
      )
      .forEach((t) => {
        const k = keyOf(t);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(t);
      });
    return [...map.entries()].sort(([a], [b]) =>
      a === "Internal" ? 1 : b === "Internal" ? -1 : a.localeCompare(b)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, query, view, viewDay, groupBy, userById, clientById, projectById, options]);

  const VIEWS = [
    ["day", "All this month", counts.day],
    ["due", "Follow-ups due", counts.due],
    ["overdue", "Overdue", counts.overdue, true],
    ["meetings", "Meetings & calls", counts.meetings],
    ["done", "Done this month", counts.done],
  ];

  const clientOptions = useMemo(
    () => [{ value: NONE, label: "Internal · no client" }, ...clients.map((c) => ({ value: c.id, label: c.name }))],
    [clients]
  );

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b border-[#eaeef4] bg-white">
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-4 md:gap-3 md:px-5 md:pt-5">
          <h1 className="min-w-[120px] flex-1 text-xl font-semibold tracking-tight text-[#0d1b3e] md:text-2xl">Work sheet</h1>
          <MonthPicker value={viewMonth} onChange={(m) => setMonth(m || null)} currentMonth={today.slice(0, 7)} />
          {canEdit && (
            <button
              type="button"
              onClick={addRow}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#2b2bb5] px-3 text-[13px] font-semibold text-white hover:bg-[#23239a]"
            >
              <Plus className="h-3.5 w-3.5" /> Add row
            </button>
          )}
        </div>
        {tabs}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 md:px-5">
          <label className="relative flex min-w-[220px] flex-1 items-center">
            <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[#94a0bf]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search task, client, SPOC, person…"
              aria-label="Search the Projects sheet"
              className="h-8 w-full rounded-md border border-[#e2e6f0] pl-8 pr-2 text-[13px] outline-none focus:border-[#2b2bb5]"
            />
          </label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            aria-label="Group by"
            className="h-8 rounded-md border border-[#e2e6f0] bg-white px-2 text-[13px]"
          >
            <option value="client">Group: Client</option>
            <option value="owner">Group: Owner</option>
            <option value="type">Group: Task type</option>
          </select>
        </div>
        <div role="tablist" aria-label="Views" className="flex flex-wrap gap-1.5 px-3 pb-3 md:px-5">
          {VIEWS.map(([key, label, n, alert]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={`rounded-full border px-3 py-1 text-[12px] ${
                view === key ? "border-[#2b2bb5] bg-[#f0f0fd] text-[#1a1a8a]" : "border-[#e2e6f0] text-[#546490] hover:text-[#0d1b3e]"
              }`}
            >
              {label}
              <b className={`ml-1.5 tabular-nums ${alert && n ? "text-rose-600" : ""}`}>{n}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1500px] border-separate border-spacing-0 bg-white">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-left text-[12px] font-semibold text-[#546490]">
              {[
                ["Task type", 150],
                ["Client", 170],
                ["Project", 170],
                ["Task / Activity", 260],
                ["SPOC", 110],
                ["Owner +", 130],
                ["Follow-up with", 170],
                ["Internal follow-up", 140],
                ["Client follow-up", 140],
                ["Status", 170],
                ["Meeting", 110],
                [`Update · ${shortDate(viewDay)}`, 240],
                ["", 120],
              ].map(([label, w]) => (
                <th key={label || "actions"} style={{ minWidth: w }} className="whitespace-nowrap border-b border-r border-[#eaeef4] px-3 py-2">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={13} className="px-5 py-10 text-center text-[13px] text-[#546490]">Loading the Projects sheet…</td>
              </tr>
            )}
            {!loading && !groups.length && (
              <tr>
                <td colSpan={13} className="px-5 py-10 text-center text-[13px] text-[#546490]">
                  {query ? "No task matches your search." : view === "day" ? "No tasks this month. Use Add row to start one." : "Nothing in this view this month."}
                </td>
              </tr>
            )}
            {groups.map(([group, rows]) => {
              const late = rows.filter((t) => lateBy(t, viewDay) > 0).length;
              return [
                <tr key={`g-${group}`}>
                  <td colSpan={13} className="border-b border-[#eaeef4] bg-[#f7f8fc] px-3 py-2 text-[13px] font-semibold text-[#0d1b3e]">
                    {group}
                    <span className="ml-2 font-normal text-[#546490]">
                      {rows.length} task{rows.length === 1 ? "" : "s"}
                      {late > 0 && <span className="text-rose-600"> · {late} late</span>}
                    </span>
                  </td>
                </tr>,
                ...rows.map((t) => {
                  const late = lateBy(t, viewDay);
                  const done = t.status === "Done";
                  const notes = notesByTask.get(t.id) || [];
                  const todayNote = notes.find((n) => n.day === viewDay);
                  const prevNote = [...notes].reverse().find((n) => n.day < viewDay);
                  const client = clientById.get(t.client_id);
                  const clientProjects = projects.filter((p) => p.client_id === t.client_id);
                  const spocs = (client?.contact_persons || []).map((c) => c.name).filter(Boolean);
                  const sel = (name) => `${t.id}:${name}`;
                  return (
                    <tr key={t.id} className={`group hover:bg-[#fafbff] ${done ? "opacity-60" : ""}`}>
                      <td className={CELL}>
                        <select
                          aria-label="Task type"
                          disabled={!canEdit}
                          value={t.task_type || ""}
                          onChange={(e) => save(t, { task_type: e.target.value })}
                          className="w-full rounded-full border-0 bg-[#f0f0fd] px-2.5 py-1 text-[12px] font-semibold text-[#1a1a8a] outline-none"
                        >
                          <option value="">Pick type</option>
                          {(options.task_types || []).map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      </td>
                      <td className={CELL}>
                        <SearchableSelect
                          open={openSelect === sel("client")}
                          onOpenChange={(o) => setOpenSelect(o ? sel("client") : null)}
                          value={t.client_id || NONE}
                          onValueChange={(v) => save(t, { client_id: v === NONE ? null : v })}
                          options={clientOptions}
                          renderValue={(o) => (t.client_id ? o?.label || "…" : <span className="text-[#94a0bf]">Internal</span>)}
                          searchPlaceholder="Search client..."
                          disabled={!canEdit}
                          contentClassName="w-[320px] p-0"
                        />
                      </td>
                      <td className={CELL}>
                        <SearchableSelect
                          open={openSelect === sel("project")}
                          onOpenChange={(o) => setOpenSelect(o ? sel("project") : null)}
                          value={t.project_id || NONE}
                          onValueChange={(v) => save(t, { project_id: v === NONE ? null : v })}
                          options={[{ value: NONE, label: "—" }, ...clientProjects.map((p) => ({ value: p.id, label: p.name }))]}
                          renderValue={(o) =>
                            t.project_id ? o?.label || projectById.get(t.project_id)?.name || "…" : (
                              <span className="text-[#94a0bf]">{t.client_id ? "Optional" : "—"}</span>
                            )
                          }
                          searchPlaceholder="Search this client's projects..."
                          emptyText="No projects for this client"
                          disabled={!canEdit || !t.client_id}
                          contentClassName="w-[380px] p-0"
                        />
                      </td>
                      <td className={CELL}>
                        <TextCell
                          multiline
                          data-task-input={t.id}
                          value={t.task}
                          disabled={!canEdit}
                          placeholder="What needs doing?"
                          onSave={(v) => save(t, { task: v })}
                          className="font-medium text-[#0d1b3e]"
                        />
                        {t.start_date < viewDay && !done && (
                          <span className="px-1.5 text-[11px] text-[#94a0bf]">Open since {shortDate(t.start_date)}</span>
                        )}
                      </td>
                      <td className={CELL}>
                        <TextCell
                          value={t.spoc}
                          disabled={!canEdit}
                          placeholder={t.client_id ? "Client contact" : "—"}
                          list={spocs.length ? `spoc-${t.id}` : undefined}
                          onSave={(v) => save(t, { spoc: v })}
                        />
                        {spocs.length > 0 && (
                          <datalist id={`spoc-${t.id}`}>
                            {spocs.map((s) => (
                              <option key={s} value={s} />
                            ))}
                          </datalist>
                        )}
                      </td>
                      <td className={CELL}>
                        <PeopleCell task={t} users={activeUsers} userById={userById} onSave={(f) => save(t, f)} disabled={!canEdit} />
                      </td>
                      <td className={CELL}>
                        <FollowUpCell
                          task={t}
                          users={activeUsers}
                          userById={userById}
                          teams={options.teams || []}
                          onSave={(f) => save(t, f)}
                          disabled={!canEdit}
                        />
                      </td>
                      <td className={CELL}>
                        <DateCell label="Internal follow-up date" value={t.internal_follow_up_date} viewDay={viewDay} done={done} disabled={!canEdit} onSave={(v) => save(t, { internal_follow_up_date: v })} />
                      </td>
                      <td className={CELL}>
                        <DateCell label="Client follow-up date" value={t.client_follow_up_date} viewDay={viewDay} done={done} disabled={!canEdit} onSave={(v) => save(t, { client_follow_up_date: v })} />
                      </td>
                      <td className={CELL}>
                        <select
                          aria-label="Status"
                          disabled={!canEdit}
                          value={t.status}
                          onChange={(e) => save(t, { status: e.target.value })}
                          className={`rounded-full border-0 px-2.5 py-1 text-[12px] font-semibold outline-none ${STATUS_STYLE[t.status] || ""}`}
                        >
                          {(options.statuses || []).map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                        {late > 0 && (
                          <span className="ml-1.5 text-[11px] font-semibold tabular-nums text-rose-600">
                            {late} day{late === 1 ? "" : "s"} late
                          </span>
                        )}
                        {(late > 0 || ["Delayed", "At risk"].includes(t.status) || t.delay_reason) && (
                          <TextCell
                            value={t.delay_reason}
                            disabled={!canEdit}
                            placeholder="Reason (optional)"
                            onSave={(v) => save(t, { delay_reason: v })}
                            className="mt-1 text-[12px] text-[#546490]"
                          />
                        )}
                      </td>
                      <td className={CELL}>
                        {isMeeting(t) ? (
                          <TextCell value={t.meeting_time} disabled={!canEdit} placeholder="e.g. 11:30–12" onSave={(v) => save(t, { meeting_time: v })} />
                        ) : (
                          <span className="px-1.5 text-[#c3c9da]">—</span>
                        )}
                      </td>
                      <td className={CELL}>
                        <TextCell
                          multiline
                          value={todayNote?.note || ""}
                          disabled={!canEdit}
                          placeholder="What happened today?"
                          onSave={(v) => saveNote(t, v)}
                        />
                        {prevNote && (
                          <p className="px-1.5 pt-0.5 text-[11px] leading-4 text-[#94a0bf]" title={prevNote.note}>
                            {shortDate(prevNote.day)}: {prevNote.note.length > 90 ? `${prevNote.note.slice(0, 90)}…` : prevNote.note}
                          </p>
                        )}
                      </td>
                      <td className={CELL}>
                        {canEdit && (
                          <div className="flex items-center gap-1">
                            {done ? (
                              <button type="button" onClick={() => save(t, { status: "On track" })} className="rounded-md border border-[#e2e6f0] px-2 py-1 text-[12px] hover:border-[#2b2bb5]">
                                Reopen
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  title="Mark done"
                                  onClick={() => save(t, { status: "Done" }).then(() => toast(`Done: ${t.task || "Untitled task"}`))}
                                  className="inline-flex items-center gap-1 rounded-md border border-[#e2e6f0] px-2 py-1 text-[12px] hover:border-emerald-500 hover:text-emerald-700"
                                >
                                  <Check className="h-3 w-3" /> Done
                                </button>
                                <button
                                  type="button"
                                  title="Move the follow-up to the next day"
                                  onClick={() => {
                                    const next = addDays(viewDay, 1);
                                    save(
                                      t,
                                      t.internal_follow_up_date || !t.client_follow_up_date
                                        ? { internal_follow_up_date: next }
                                        : { client_follow_up_date: next }
                                    );
                                  }}
                                  className="rounded-md border border-[#e2e6f0] px-2 py-1 text-[12px] hover:border-[#2b2bb5]"
                                >
                                  Tomorrow
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              aria-label="Delete row"
                              title="Delete row"
                              onClick={() => removeRow(t)}
                              className="rounded-md p-1 text-[#94a0bf] opacity-0 hover:text-rose-600 group-hover:opacity-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProjectsSheet;
