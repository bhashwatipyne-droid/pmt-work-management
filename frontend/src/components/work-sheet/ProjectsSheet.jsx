import { cloneElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Filter,
  LayoutList,
  Maximize2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "../ui/popover";
import ConfirmDeleteModal from "../ui/ConfirmDeleteModal";
import { MonthPicker } from "./MonthPicker";
import { WorksheetFormulaBar } from "./WorksheetFormulaBar";
import { makeMatcher } from "@/lib/search";
import {
  createProjectTask,
  deleteProjectTask,
  getClients,
  getProjectTasks,
  setProjectTaskUpdate,
  updateProjectTask,
} from "@/services/api";

// Work Sheet > Management tab: the Projects team's follow-up sheet.
//
// Drawn exactly like the redesign's Management sheet: a day stepper, the same
// grid as the other sheets (frozen ID + Task columns, formula bar, grouped by
// member, a cell is selected with a click and edited with Enter, a double
// click or by typing).
//
// A task is one row that stays open until it is marked Done, so the list for a
// day is every task open on that day - nobody copies yesterday's rows forward.
// What happened on a day goes in that day's Remark (its update note); days
// late are counted from the follow-up dates instead of being typed.
//
// Not production work: none of this counts toward efficiency.

// Redesign (Mint) tokens.
const C = {
  n50: "#f9fafb",
  n100: "#f5f6f8",
  n200: "#eff0f2",
  n300: "#d1d5db",
  n400: "#8a97b5",
  n500: "#546490",
  n700: "#4a5878",
  n900: "#0d1b3e",
  b50: "#f0f0fd",
  b100: "#dcdcf8",
  b200: "#9090ec",
  b500: "#2b2bb5",
  b700: "#1a1a8a",
  line: "#e2e8f0", // header / gutter grid lines
  cellLine: "#eaeef4", // body grid lines
  edge: "#d6deec", // right edge of the frozen columns
};

const BADGE = {
  Success: { bg: "#d1fae5", ring: "#d1fae5", fg: "rgb(0,91,75)", dot: "#10b981" },
  Warning: { bg: "#fef3c7", ring: "#fef3c7", fg: "rgb(146,64,14)", dot: "#f59e0b" },
  Error: { bg: "#fff5f5", ring: "#fff5f5", fg: "#ef4444", dot: "#ef4444" },
  Neutral: { bg: C.n100, ring: C.n200, fg: C.n700, dot: C.n400 },
};
const STATUS_BADGE = { "On track": "Success", Done: "Success", "At risk": "Warning", Delayed: "Error" };

const THREE_TEAMS = ["Content", "Design", "Animation"];
const NONE = "__none__";
const MANROPE = "Manrope, Inter, -apple-system, sans-serif";

// Columns, widths and frozen offsets as in the redesign's Management sheet.
const COLS = [
  { key: "id", label: "ID", w: 84, kind: "ro", left: 48 },
  { key: "task", label: "Task / activity", w: 300, kind: "text", left: 132, edge: true, long: 30 },
  { key: "type", label: "Task type", w: 160, kind: "select", filter: "type" },
  { key: "client", label: "Client", w: 150, kind: "select", filter: "client" },
  { key: "owner", label: "Stakeholder", w: 150, kind: "people", filter: "owner" },
  { key: "followup", label: "Follow-up with", w: 190, kind: "followup" },
  { key: "contact", label: "Client contact", w: 130, kind: "text" },
  { key: "count", label: "Deliverables", w: 110, kind: "number" },
  { key: "ifu", label: "Internal FU", w: 104, kind: "date" },
  { key: "cfu", label: "Client FU", w: 104, kind: "date" },
  { key: "status", label: "Tracking status", w: 150, kind: "select", filter: "status" },
  { key: "meet", label: "Meeting", w: 110, kind: "text" },
  { key: "date", label: "Date", w: 84, kind: "date" },
  { key: "remark", label: "Remark", w: 280, kind: "text", long: 34 },
];
const GRID = `48px ${COLS.map((c) => `${c.w}px`).join(" ")}`;
const TEXT_FIELD = { task: "task", contact: "spoc", meet: "meeting_time" };
const DATE_FIELD = { ifu: "internal_follow_up_date", cfu: "client_follow_up_date", date: "start_date" };

// Fields the Filter menu (and the column menus) filter on.
const FIELDS = [
  { key: "type", label: "Task type" },
  { key: "client", label: "Client" },
  { key: "owner", label: "Stakeholder" },
  { key: "status", label: "Tracking status" },
  { key: "follow", label: "Follow-up" },
];

const GROUPS = [
  ["owner", "Member"],
  ["client", "Client"],
  ["type", "Task type"],
  ["none", "None"],
];

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysBetween = (a, b) => Math.round((new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`)) / 864e5);
const shortDate = (day) =>
  day ? new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "";
const weekdayDate = (day) =>
  `${new Date(`${day}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short" })} ${shortDate(day)}`;
const initials = (name = "") =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

const nextFollowUp = (t) => [t.internal_follow_up_date, t.client_follow_up_date].filter(Boolean).sort()[0] || "";
const lateBy = (t, day) => {
  if (t.status === "Done") return 0;
  const next = nextFollowUp(t);
  return next && next < day ? daysBetween(day, next) : 0;
};

const isPrintable = (e) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

function Checkbox({ on, partial, onClick, label }) {
  return (
    <span
      role="checkbox"
      aria-checked={partial ? "mixed" : on}
      aria-label={label}
      onClick={onClick}
      style={{
        width: 16,
        height: 16,
        borderRadius: 5.333,
        background: on || partial ? C.b500 : "#fff",
        boxShadow: on || partial ? "none" : `inset 0 0 0 1px ${C.n300}`,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 120ms ease, box-shadow 120ms ease",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {on && <Check className="h-3 w-3" strokeWidth={3} />}
      {partial && !on && <span style={{ width: 8, height: 2, borderRadius: 1, background: "#fff" }} />}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = BADGE[STATUS_BADGE[status] || "Neutral"];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: 24,
        padding: "4px 12px",
        boxSizing: "border-box",
        borderRadius: 9999,
        background: s.bg,
        boxShadow: `inset 0 0 0 1px ${s.ring}`,
        color: s.fg,
        font: `400 10px/16px ${MANROPE}`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 9999, background: s.dot, flexShrink: 0 }} />
      {status}
    </span>
  );
}

// Popover chrome from the redesign's menus.
const MENU =
  "flex max-h-[460px] w-[300px] flex-col overflow-hidden rounded-[12px] border-0 p-0 text-[13px] text-[#0d1b3e] shadow-[0_0_0_1px_#eaeef4,0_6px_25px_rgba(13,28,61,0.12)]";
const MENU_LABEL = "px-2 pb-1 pt-1.5 text-[11px] font-bold uppercase leading-[14px] tracking-[0.05em] text-[#546490]";
const MENU_ITEM =
  "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2 text-left text-[13px] text-[#0d1b3e] hover:bg-[#f0f0fd]";

function SearchField({ value, onChange, placeholder, autoFocus = true, onKeyDown }) {
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
function ValuesPanel({ title, values, selected, onToggle, onClear, onDone, onBack }) {
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
function OptionList({ options, value, onPick, searchable }) {
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

function Avatar({ name, size = 20, fontSize = 9 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        background: C.b50,
        color: C.b700,
        fontSize,
        fontWeight: 600,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </span>
  );
}

// Stakeholder: tick people; the first one ticked is the owner.
function PeoplePicker({ task, users, onSave }) {
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
function FollowUpPicker({ task, users, teams, onSave }) {
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
function ExpandEditor({ value, onSave, readOnly }) {
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

export function ProjectsSheet({ currentUser, users = [], tabs }) {
  const [tasks, setTasks] = useState([]);
  const [updates, setUpdates] = useState([]);
  const [options, setOptions] = useState({ task_types: [], statuses: [], teams: [], meeting_types: [] });
  const [clients, setClients] = useState([]);
  const [today, setToday] = useState(() => addDays(new Date().toISOString().slice(0, 10), 0));
  const [month, setMonth] = useState(null); // "2026-10"; null = this month
  const [pickedDay, setPickedDay] = useState(null); // null = the month's default day
  const [allDays, setAllDays] = useState(false);
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState("owner");
  const [collapsed, setCollapsed] = useState({});
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null); // { key, dir }
  const [loading, setLoading] = useState(true);
  const [cell, setCell] = useState(null); // { r: taskId, c: colKey }
  const [editing, setEditing] = useState(null); // { r, c, draft }
  const [menu, setMenu] = useState(null); // { r, c, kind: "pick" | "expand" }
  const [headMenu, setHeadMenu] = useState(null); // column key
  const [filterMenu, setFilterMenu] = useState(null); // null | "fields" | field key
  const [sel, setSel] = useState({});
  const [statusMenu, setStatusMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const gridRef = useRef(null);
  const lastSelRef = useRef(null);
  const pendingEditRef = useRef(null);

  const canEdit = currentUser?.role !== "hr";

  // The sheet shows one month. "Late" and the Remark (that day's update note)
  // work off one day of it: the day on the stepper, or with "All days" today in
  // the current month, the last day of a past month, the first of a future one.
  const viewMonth = month || today.slice(0, 7);
  const monthStart = `${viewMonth}-01`;
  const monthEnd = addDays(`${addDays(`${viewMonth}-28`, 4).slice(0, 7)}-01`, -1);
  const defaultDay = today >= monthStart && today <= monthEnd ? today : today > monthEnd ? monthEnd : monthStart;
  const stepDay = pickedDay && pickedDay >= monthStart && pickedDay <= monthEnd ? pickedDay : defaultDay;
  const refDay = allDays ? defaultDay : stepDay;
  const rangeEnd = today < monthStart ? monthEnd : defaultDay;

  const openInMonth = useCallback(
    (t) => (t.start_date || "") <= monthEnd && !(t.done_date && t.done_date < monthStart),
    [monthStart, monthEnd]
  );
  const openOnDay = useCallback(
    (t) => (t.start_date || "") <= stepDay && !(t.done_date && t.done_date < stepDay),
    [stepDay]
  );
  const inView = useCallback((t) => (allDays ? openInMonth(t) : openOnDay(t)), [allDays, openInMonth, openOnDay]);

  const load = useCallback(() => {
    return getProjectTasks()
      .then((data) => {
        setTasks(data.tasks || []);
        setUpdates(data.updates || []);
        setOptions(data.options || {});
        if (data.today) setToday(data.today);
      })
      .catch(() => toast.error("Couldn't load the Management sheet. Refresh to try again."))
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

  // A short, stable ID per task (M-001...) in the order the tasks were added.
  const displayId = useMemo(() => {
    const map = new Map();
    [...tasks]
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""))
      .forEach((t, i) => map.set(t.id, `M-${String(i + 1).padStart(3, "0")}`));
    return map;
  }, [tasks]);

  const notesByTask = useMemo(() => {
    const map = new Map();
    [...updates]
      .sort((a, b) => (a.day || "").localeCompare(b.day || ""))
      .forEach((u) => {
        const list = map.get(u.task_id) || [];
        list.push(u);
        map.set(u.task_id, list);
      });
    return map;
  }, [updates]);

  const noteFor = useCallback(
    (taskId) => (notesByTask.get(taskId) || []).find((n) => n.day === refDay)?.note || "",
    [notesByTask, refDay]
  );

  // What each cell shows (and what search, sort and filters work on).
  const view = useCallback(
    (t) => {
      const owner = userById.get(t.owner_id)?.name || "";
      const extra = (t.collaborator_ids || []).length;
      const teams = t.follow_up_teams || [];
      const late = lateBy(t, refDay);
      const notes = notesByTask.get(t.id) || [];
      const note = notes.find((n) => n.day === refDay)?.note || [...notes].reverse().find((n) => n.day < refDay)?.note || "";
      return {
        id: displayId.get(t.id) || "",
        task: t.task || "",
        type: t.task_type || "",
        client: clientById.get(t.client_id)?.name || "",
        owner,
        ownerText: owner ? `${owner}${extra ? ` +${extra}` : ""}` : "",
        followup: [
          ...teams,
          ...(t.follow_up_user_ids || []).map((id) => userById.get(id)?.name?.split(" ")[0]).filter(Boolean),
          ...(t.follow_up_others ? [t.follow_up_others] : []),
        ].join(", "),
        contact: t.spoc || "",
        count: t.deliverable_count ?? "",
        ifu: shortDate(t.internal_follow_up_date),
        cfu: shortDate(t.client_follow_up_date),
        status: t.status || "",
        meet: t.meeting_time || "",
        date: shortDate(t.start_date),
        remark: [late ? `${late}d late` : "", t.delay_reason, note].filter(Boolean).join(" · "),
        late,
        due: !!nextFollowUp(t) && nextFollowUp(t) <= refDay && t.status !== "Done",
      };
    },
    [userById, clientById, displayId, notesByTask, refDay]
  );

  const views = useMemo(() => new Map(tasks.map((t) => [t.id, view(t)])), [tasks, view]);

  const fieldValue = (v, field) =>
    field === "follow" ? (v.late > 0 ? "Overdue" : v.due ? "Due" : "") : field === "owner" ? v.owner : v[field];

  const dayTasks = useMemo(() => tasks.filter(inView), [tasks, inView]);
  const monthCount = useMemo(() => tasks.filter(openInMonth).length, [tasks, openInMonth]);

  const visible = useMemo(() => {
    const match = makeMatcher(query);
    return dayTasks.filter((t) => {
      const v = views.get(t.id);
      if (query.trim() && !match(v.id, v.task, v.type, v.client, v.ownerText, v.followup, v.contact, v.remark, v.meet))
        return false;
      return Object.entries(filters).every(([f, vals]) => !vals?.length || vals.includes(fieldValue(v, f)));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayTasks, views, query, filters]);

  const groups = useMemo(() => {
    const sortVal = (t) => {
      if (!sort) return t.created_at || "";
      if (DATE_FIELD[sort.key]) return t[DATE_FIELD[sort.key]] || "";
      if (sort.key === "count") return t.deliverable_count ?? -1;
      return String(views.get(t.id)[sort.key === "owner" ? "ownerText" : sort.key] || "").toLowerCase();
    };
    const rows = [...visible].sort((a, b) => {
      const x = sortVal(a);
      const y = sortVal(b);
      const cmp = typeof x === "number" ? x - y : String(x).localeCompare(String(y));
      return sort?.dir === "desc" ? -cmp : cmp;
    });
    if (groupBy === "none") return [{ key: "all", name: "", rows }];
    const keyOf = (t) => {
      const v = views.get(t.id);
      if (groupBy === "owner") return v.owner || "Unassigned";
      if (groupBy === "client") return v.client || "Internal";
      return v.type || "No type";
    };
    const map = new Map();
    rows.forEach((t) => {
      const k = keyOf(t);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    });
    const last = new Set(["Unassigned", "Internal", "No type"]);
    return [...map.entries()]
      .sort(([a], [b]) => (last.has(a) ? 1 : last.has(b) ? -1 : a.localeCompare(b)))
      .map(([key, list]) => ({ key, name: key, rows: list }));
  }, [visible, views, sort, groupBy]);

  // Rows in screen order (collapsed groups hidden) - for arrow keys and Shift+click.
  const flatRows = useMemo(
    () => groups.flatMap((g) => (collapsed[g.key] ? [] : g.rows)),
    [groups, collapsed]
  );

  const save = useCallback(
    (task, fields) => {
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, ...fields } : t)));
      return updateProjectTask(task.id, { ...fields, day: refDay })
        .then((saved) => setTasks((list) => list.map((t) => (t.id === task.id ? saved : t))))
        .catch((err) => {
          setTasks((list) => list.map((t) => (t.id === task.id ? task : t)));
          toast.error(err?.response?.data?.detail || "Couldn't save that change");
        });
    },
    [refDay]
  );

  const saveNote = (task, note) => {
    setUpdates((list) => [
      ...list.filter((u) => !(u.task_id === task.id && u.day === refDay)),
      ...(note ? [{ task_id: task.id, day: refDay, note, user_id: currentUser?.id }] : []),
    ]);
    setProjectTaskUpdate(task.id, refDay, note).catch(() => toast.error("Couldn't save the remark"));
  };

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // The raw value a cell edits (not what it shows).
  const editValue = (t, key) => {
    if (TEXT_FIELD[key]) return t[TEXT_FIELD[key]] || "";
    if (DATE_FIELD[key]) return t[DATE_FIELD[key]] || "";
    if (key === "count") return t.deliverable_count == null ? "" : String(t.deliverable_count);
    if (key === "remark") return noteFor(t.id);
    return "";
  };

  const commitText = (t, key, text) => {
    const value = (text ?? "").trim();
    if (value === editValue(t, key).trim()) return;
    if (TEXT_FIELD[key]) save(t, { [TEXT_FIELD[key]]: value });
    else if (key === "remark") saveNote(t, value);
    else if (key === "count") {
      if (value && !/^\d+$/.test(value)) {
        toast.error("Deliverables must be a whole number");
        return;
      }
      save(t, { deliverable_count: value ? Number(value) : null });
    } else if (DATE_FIELD[key]) {
      if (key === "date" && !value) {
        toast.error("A task needs a date");
        return;
      }
      save(t, { [DATE_FIELD[key]]: value || null });
    }
  };

  const focusGrid = () => gridRef.current?.focus({ preventScroll: true });

  const moveCell = (dr, dc) => {
    if (!cell) return;
    const ri = flatRows.findIndex((t) => t.id === cell.r);
    const ci = COLS.findIndex((c) => c.key === cell.c);
    const nr = flatRows[Math.max(0, Math.min(flatRows.length - 1, ri + dr))];
    const nc = COLS[Math.max(0, Math.min(COLS.length - 1, ci + dc))];
    if (nr && nc) setCell({ r: nr.id, c: nc.key });
  };

  // Enter / double click on a cell: type in it, or open its picker.
  const startEdit = (taskId, key, initial) => {
    const col = COLS.find((c) => c.key === key);
    const t = taskById.get(taskId);
    if (!t || !canEdit || col.kind === "ro") return;
    setCell({ r: taskId, c: key });
    if (["text", "number", "date"].includes(col.kind)) {
      setEditing({ r: taskId, c: key, draft: initial ?? editValue(t, key) });
    } else {
      setMenu({ r: taskId, c: key, kind: "pick" });
    }
  };

  const finishEdit = (save_, move) => {
    if (!editing) return;
    const t = taskById.get(editing.r);
    if (save_ && t) commitText(t, editing.c, editing.draft);
    setEditing(null);
    if (move === "down") moveCell(1, 0);
    else if (move === "up") moveCell(-1, 0);
    else if (move === "right") moveCell(0, 1);
    else if (move === "left") moveCell(0, -1);
    requestAnimationFrame(focusGrid);
  };

  // Keep the selected cell in view.
  useEffect(() => {
    if (!cell) return;
    const el = gridRef.current?.querySelector(`[data-cell="${cell.r}:${cell.c}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [cell]);

  // A new row opens straight into its Task cell.
  useEffect(() => {
    const id = pendingEditRef.current;
    if (id && taskById.get(id)) {
      pendingEditRef.current = null;
      setCell({ r: id, c: "task" });
      setEditing({ r: id, c: "task", draft: "" });
    }
  }, [taskById]);

  const onGridKey = (e) => {
    // Only keys pressed on the sheet itself (not in a menu opened from it).
    if (e.target !== e.currentTarget || editing || menu || !cell) return;
    const t = taskById.get(cell.r);
    const col = COLS.find((c) => c.key === cell.c);
    const moves = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowRight: [0, 1], ArrowLeft: [0, -1] };
    if (moves[e.key]) {
      e.preventDefault();
      moveCell(...moves[e.key]);
    } else if (e.key === "Tab") {
      e.preventDefault();
      moveCell(0, e.shiftKey ? -1 : 1);
    } else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && col.long) setMenu({ r: cell.r, c: cell.c, kind: "expand" });
      else startEdit(cell.r, cell.c);
    } else if (e.key === "Escape") {
      setCell(null);
    } else if ((e.key === "Delete" || e.key === "Backspace") && canEdit && t) {
      if (["text", "number"].includes(col.kind) || (col.kind === "date" && col.key !== "date")) {
        e.preventDefault();
        commitText(t, col.key, "");
      }
    } else if (isPrintable(e) && canEdit && ["text", "number"].includes(col.kind)) {
      e.preventDefault();
      startEdit(cell.r, cell.c, e.key);
    }
  };

  const addRow = () => {
    createProjectTask({ day: refDay })
      .then((task) => {
        setQuery("");
        setFilters({});
        pendingEditRef.current = task.id;
        setTasks((list) => [...list, task]);
      })
      .catch((err) => toast.error(err?.response?.data?.detail || "Couldn't add a row"));
  };

  // --- Row selection + bulk actions -------------------------------------
  const selIds = Object.keys(sel).filter((id) => sel[id] && taskById.get(id));
  const visIds = flatRows.map((t) => t.id);
  const allVisSel = visIds.length > 0 && visIds.every((id) => sel[id]);
  const someVisSel = !allVisSel && visIds.some((id) => sel[id]);

  const toggleRow = (id, shift) => {
    if (shift && lastSelRef.current) {
      const a = visIds.indexOf(lastSelRef.current);
      const b = visIds.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        const on = !sel[id];
        setSel((s) => {
          const next = { ...s };
          visIds.slice(from, to + 1).forEach((x) => (next[x] = on));
          return next;
        });
        lastSelRef.current = id;
        return;
      }
    }
    lastSelRef.current = id;
    setSel((s) => ({ ...s, [id]: !s[id] }));
  };

  const bulkStatus = (status) => {
    setStatusMenu(false);
    selIds.forEach((id) => save(taskById.get(id), { status }));
    toast(`Set ${selIds.length} task${selIds.length === 1 ? "" : "s"} to ${status}`);
  };

  const bulkDuplicate = async () => {
    const copies = [];
    for (const id of selIds) {
      const t = taskById.get(id);
      const fields = {
        task: t.task,
        task_type: t.task_type,
        client_id: t.client_id,
        project_id: t.project_id,
        spoc: t.spoc,
        owner_id: t.owner_id,
        collaborator_ids: t.collaborator_ids,
        follow_up_teams: t.follow_up_teams,
        follow_up_user_ids: t.follow_up_user_ids,
        follow_up_others: t.follow_up_others,
        internal_follow_up_date: t.internal_follow_up_date,
        client_follow_up_date: t.client_follow_up_date,
        meeting_time: t.meeting_time,
        deliverable_count: t.deliverable_count,
        day: refDay,
      };
      try {
        copies.push(await createProjectTask(fields));
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Couldn't duplicate a row");
      }
    }
    if (copies.length) {
      setTasks((list) => [...list, ...copies]);
      setSel(Object.fromEntries(copies.map((c) => [c.id, true])));
      toast(`Duplicated ${copies.length} row${copies.length === 1 ? "" : "s"}`);
    }
  };

  const bulkDelete = async () => {
    setDeleting(true);
    const gone = [];
    for (const id of selIds) {
      try {
        await deleteProjectTask(id);
        gone.push(id);
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Couldn't delete a row");
      }
    }
    setTasks((list) => list.filter((t) => !gone.includes(t.id)));
    setSel({});
    setDeleting(false);
    setConfirmDelete(false);
    if (gone.length) toast(`Deleted ${gone.length} row${gone.length === 1 ? "" : "s"}`);
  };

  // --- Filters ----------------------------------------------------------
  const valuesFor = (field) => {
    const counts = new Map();
    dayTasks.forEach((t) => {
      const v = fieldValue(views.get(t.id), field);
      if (v) counts.set(v, (counts.get(v) || 0) + 1);
    });
    const base =
      field === "status"
        ? options.statuses || []
        : field === "type"
          ? options.task_types || []
          : field === "follow"
            ? ["Due", "Overdue"]
            : [...counts.keys()].sort((a, b) => a.localeCompare(b));
    const all = [...new Set([...base, ...counts.keys()])];
    return all.map((v) => ({
      value: v,
      label: field === "follow" ? (v === "Due" ? "Due by this day" : "Overdue") : v,
      count: counts.get(v) || 0,
    }));
  };
  const toggleFilter = (field, value) =>
    setFilters((f) => {
      const cur = f[field] || [];
      return { ...f, [field]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] };
    });
  const activeFields = FIELDS.filter((f) => filters[f.key]?.length);
  const clearFilters = () => {
    setFilters({});
    setQuery("");
  };

  const allCollapsed = groups.length > 0 && groupBy !== "none" && groups.every((g) => collapsed[g.key]);
  const toggleAll = () =>
    setCollapsed(allCollapsed ? {} : Object.fromEntries(groups.map((g) => [g.key, true])));

  // --- Formula bar ------------------------------------------------------
  const activeTask = cell ? taskById.get(cell.r) : null;
  const activeCol = cell ? COLS.find((c) => c.key === cell.c) : null;
  const activeView = activeTask ? views.get(activeTask.id) : null;
  const formulaEditable = !!activeTask && canEdit && ["text", "number"].includes(activeCol?.kind);
  const formulaValue = activeTask
    ? formulaEditable
      ? editValue(activeTask, activeCol.key)
      : activeCol.key === "owner"
        ? activeView.ownerText
        : activeCol.key === "remark"
          ? activeView.remark
          : String(activeView[activeCol.key] ?? "")
    : "";

  const shell = (children) => <div className="flex h-full flex-col bg-white">{children}</div>;

  const control = { boxShadow: `inset 0 0 0 1px ${C.n200}` };

  const headerCell = (col) => {
    const sorted = sort?.key === col.key;
    const filtered = col.filter && filters[col.filter]?.length;
    const Icon = sorted ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : filtered ? Filter : ChevronDown;
    const frozen = col.left != null;
    return (
      <Popover key={col.key} open={headMenu === col.key} onOpenChange={(o) => setHeadMenu(o ? col.key : null)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-haspopup="menu"
            title={`Sort and filter ${col.label}`}
            className="hover:!text-[#0d1b3e]"
            style={{
              position: frozen ? "sticky" : "relative",
              left: frozen ? col.left : "auto",
              zIndex: frozen ? 3 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
              padding: "0 10px",
              border: "none",
              borderRadius: 0,
              background: sorted || filtered ? C.b50 : C.n50,
              boxShadow: col.edge
                ? `inset -2px 0 0 ${C.edge}, inset 0 -1px 0 ${C.line}`
                : `inset -1px -1px 0 ${C.line}`,
              color: sorted || filtered ? C.b700 : C.n700,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
              textAlign: "left",
            }}
          >
            <span>{col.label}</span>
            <Icon className="h-3 w-3 shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" sideOffset={2} className={MENU}>
          <div className="flex flex-col gap-px p-1.5" style={{ boxShadow: `inset 0 -1px 0 ${C.cellLine}` }}>
            <div className={MENU_LABEL}>Sort {col.label}</div>
            {[
              ["asc", "Sort A → Z", ArrowUp],
              ["desc", "Sort Z → A", ArrowDown],
            ].map(([dir, label, I]) => {
              const on = sort?.key === col.key && sort.dir === dir;
              return (
                <button
                  key={dir}
                  type="button"
                  onClick={() => {
                    setSort(on ? null : { key: col.key, dir });
                    if (!col.filter) setHeadMenu(null);
                  }}
                  className={MENU_ITEM}
                  style={on ? { background: C.b50, color: C.b700 } : undefined}
                >
                  <I className="h-3.5 w-3.5" />
                  <span className="flex-1">{label}</span>
                  {on && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
          </div>
          {col.filter && (
            <ValuesPanel
              title={col.label}
              values={valuesFor(col.filter)}
              selected={filters[col.filter] || []}
              onToggle={(v) => toggleFilter(col.filter, v)}
              onClear={() => setFilters((f) => ({ ...f, [col.filter]: [] }))}
              onDone={() => setHeadMenu(null)}
            />
          )}
        </PopoverContent>
      </Popover>
    );
  };

  const pickerFor = (t, col) => {
    const close = () => {
      setMenu(null);
      requestAnimationFrame(focusGrid);
    };
    if (col.key === "type")
      return (
        <OptionList
          value={t.task_type || ""}
          options={[{ value: "", label: "No type" }, ...(options.task_types || []).map((o) => ({ value: o, label: o }))]}
          onPick={(v) => {
            save(t, { task_type: v });
            close();
          }}
        />
      );
    if (col.key === "status")
      return (
        <OptionList
          value={t.status}
          options={(options.statuses || []).map((s) => ({ value: s, label: s, render: <StatusBadge status={s} /> }))}
          onPick={(v) => {
            save(t, { status: v }).then(() => v === "Done" && t.status !== "Done" && toast(`Done: ${t.task || "Untitled task"}`));
            close();
          }}
        />
      );
    if (col.key === "client")
      return (
        <OptionList
          searchable
          value={t.client_id || NONE}
          options={[{ value: NONE, label: "Internal · no client" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
          onPick={(v) => {
            save(t, { client_id: v === NONE ? null : v });
            close();
          }}
        />
      );
    if (col.key === "owner")
      return <PeoplePicker task={t} users={activeUsers} onSave={(f) => save(t, f)} />;
    if (col.key === "followup")
      return <FollowUpPicker task={t} users={activeUsers} teams={options.teams || []} onSave={(f) => save(t, f)} />;
    return null;
  };

  const renderCell = (t, v, col, ri, ci) => {
    const isAct = cell?.r === t.id && cell?.c === col.key;
    const isEditing = editing?.r === t.id && editing?.c === col.key;
    const frozen = col.left != null;
    const raw = col.key === "owner" ? v.ownerText : v[col.key];
    const text = raw == null ? "" : String(raw);
    const empty = !text;
    const caret = ["select", "people"].includes(col.kind) && !isEditing;
    const showExpand =
      !isEditing && col.long && (isAct || (!empty && text.length > col.long));
    const menuOpen = menu?.r === t.id && menu?.c === col.key;
    const muted = col.kind === "ro" || col.key === "date";
    return (
      <div
        key={col.key}
        role="gridcell"
        data-cell={`${t.id}:${col.key}`}
        aria-selected={isAct}
        title={empty || isEditing ? undefined : text}
        onMouseDown={(e) => {
          // Ignore clicks inside this cell's menu (it is portalled, but React
          // still bubbles its events here).
          if (isEditing || !e.currentTarget.contains(e.target)) return;
          e.preventDefault();
          if (editing) finishEdit(true);
          const wasActive = isAct;
          setCell({ r: t.id, c: col.key });
          focusGrid();
          if (wasActive && ["select", "people", "followup"].includes(col.kind)) startEdit(t.id, col.key);
        }}
        onDoubleClick={(e) => e.currentTarget.contains(e.target) && startEdit(t.id, col.key)}
        className={frozen ? "bg-white group-hover/row:bg-[#f9fafb]" : ""}
        style={{
          position: frozen ? "sticky" : "relative",
          left: frozen ? col.left : "auto",
          zIndex: frozen ? 2 : isAct ? 1 : 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          padding: "0 10px",
          ...(frozen && sel[t.id] ? { background: C.b50 } : {}),
          boxShadow: isAct
            ? `inset 0 0 0 2px ${C.b500}`
            : col.edge
              ? `inset -2px 0 0 ${C.edge}, inset 0 -1px 0 ${C.cellLine}`
              : `inset -1px -1px 0 ${C.cellLine}`,
          color: muted ? C.n500 : C.n900,
          fontWeight: col.key === "task" ? 500 : 400,
          cursor: "cell",
        }}
      >
        {isEditing && (
          <input
            autoFocus
            aria-label="Edit cell"
            type={col.kind === "date" ? "date" : "text"}
            inputMode={col.kind === "number" ? "numeric" : undefined}
            data-sheet-cell="1"
            data-sheet-row={ri}
            data-sheet-col={ci}
            value={editing.draft}
            onChange={(e) => {
              const draft = e.target.value;
              setEditing((cur) => (cur ? { ...cur, draft } : cur));
            }}
            onFocus={(e) => {
              if (col.kind !== "date") {
                const n = e.target.value.length;
                e.target.setSelectionRange(n, n);
              }
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                finishEdit(true, e.shiftKey ? "up" : "down");
              } else if (e.key === "Tab") {
                e.preventDefault();
                finishEdit(true, e.shiftKey ? "left" : "right");
              } else if (e.key === "Escape") {
                e.preventDefault();
                finishEdit(false);
              }
            }}
            onBlur={() => finishEdit(true)}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
              padding: "0 10px",
              border: "none",
              outline: "none",
              borderRadius: 0,
              boxShadow: `inset 0 0 0 2px ${C.b500}, 0 3px 6px rgba(13,28,61,0.08)`,
              background: "#fff",
              font: "inherit",
              fontSize: 13,
              color: C.n900,
              textAlign: col.kind === "number" ? "right" : "left",
              zIndex: 3,
            }}
          />
        )}
        {!isEditing && col.key === "owner" && !empty && <Avatar name={v.owner} />}
        {!isEditing && col.key === "status" && !empty && (
          <span style={{ flex: 1, minWidth: 0, display: "flex" }}>
            <StatusBadge status={text} />
          </span>
        )}
        {!isEditing && col.key !== "status" && (
          <span
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: col.kind === "number" ? "right" : "left",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {text}
          </span>
        )}
        {caret && <ChevronDown className="h-3 w-3 shrink-0" style={{ color: isAct ? C.b500 : C.n300 }} />}
        {showExpand && (
          <button
            type="button"
            aria-label="Expand cell"
            title="Expand (Ctrl Enter)"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCell({ r: t.id, c: col.key });
              setMenu({ r: t.id, c: col.key, kind: "expand" });
            }}
            className="hover:!bg-[#f0f0fd] hover:!text-[#2b2bb5]"
            style={{
              flexShrink: 0,
              width: 22,
              height: 22,
              border: "none",
              borderRadius: 6,
              background: isAct ? C.b50 : "#fff",
              boxShadow: `inset 0 0 0 1px ${C.cellLine}`,
              color: isAct ? C.b500 : C.n400,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        )}
        {menuOpen && (
          <Popover
            open
            onOpenChange={(o) => {
              if (!o) {
                setMenu(null);
                requestAnimationFrame(focusGrid);
              }
            }}
          >
            <PopoverAnchor asChild>
              <span style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
            </PopoverAnchor>
            <PopoverContent
              align="start"
              sideOffset={2}
              className={`${MENU} ${menu.kind === "expand" ? "w-[380px]" : col.key === "followup" ? "w-[280px]" : "w-[260px]"}`}
              onOpenAutoFocus={(e) => {
                if (!["client", "owner", "followup"].includes(col.key) && menu.kind !== "expand") e.preventDefault();
              }}
            >
              {menu.kind === "expand" ? (
                col.key === "remark" ? (
                  <ExpandEditor value={noteFor(t.id)} readOnly={!canEdit} onSave={(note) => saveNote(t, note)} />
                ) : (
                  <ExpandEditor value={t.task} readOnly={!canEdit} onSave={(task) => save(t, { task })} />
                )
              ) : (
                pickerFor(t, col)
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  };

  const tabsWithCount =
    tabs && cloneElement(tabs, { counts: { ...(tabs.props.counts || {}), Projects: dayTasks.length } });

  return shell(
    <>
      <div className="bg-white">
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3 pt-4 md:gap-3 md:px-5 md:pt-5">
          <h1 className="min-w-[120px] flex-1 text-xl font-semibold tracking-tight text-[#0d1b3e] md:min-w-[160px] md:text-2xl">
            Work sheet
          </h1>
          <MonthPicker
            value={viewMonth}
            allowAll={false}
            onChange={(m) => {
              setMonth(m || null);
              setPickedDay(null);
            }}
            currentMonth={today.slice(0, 7)}
          />
          {canEdit && (
            <button
              type="button"
              onClick={addRow}
              className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[#2b2bb5] px-3.5 text-[13px] font-semibold text-white hover:bg-[#3d3dcc]"
            >
              <Plus className="h-3.5 w-3.5" /> Add row
            </button>
          )}
        </div>
        {tabsWithCount}

        <div
          className="flex flex-wrap items-center gap-2 px-3 py-2.5 md:px-5"
          style={{ boxShadow: `inset 0 -1px 0 ${C.cellLine}` }}
        >
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center rounded-[7px] bg-white" style={control}>
              <button
                type="button"
                aria-label="Previous day"
                disabled={allDays || stepDay <= monthStart}
                onClick={() => setPickedDay(addDays(stepDay, -1))}
                className="flex h-8 w-8 items-center justify-center rounded-l-[7px] text-[#4a5878] hover:bg-[#f9fafb] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="flex min-w-[120px] items-center justify-center gap-1.5 whitespace-nowrap text-[13px] font-semibold text-[#0d1b3e]">
                <CalendarDays className="h-3.5 w-3.5" />
                {allDays ? `${shortDate(monthStart)} – ${shortDate(rangeEnd)}` : weekdayDate(stepDay)}
              </span>
              <button
                type="button"
                aria-label="Next day"
                disabled={allDays || stepDay >= monthEnd}
                onClick={() => setPickedDay(addDays(stepDay, 1))}
                className="flex h-8 w-8 items-center justify-center rounded-r-[7px] text-[#4a5878] hover:bg-[#f9fafb] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              aria-pressed={allDays}
              onClick={() => {
                setAllDays((a) => !a);
                setCell(null);
              }}
              className="h-8 whitespace-nowrap rounded-[7px] px-3 text-[12px] font-semibold"
              style={{
                background: allDays ? C.b50 : "#fff",
                color: allDays ? C.b700 : C.n700,
                boxShadow: `inset 0 0 0 1px ${allDays ? C.b200 : C.n200}`,
              }}
            >
              All days
            </button>
            <span className="h-5 w-px" style={{ background: C.cellLine }} />
          </div>

          <label
            className="flex h-8 min-w-[240px] items-center gap-2 rounded-[7px] bg-white px-2.5 text-[#546490]"
            style={{ ...control, flex: "0 1 320px" }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <input
              aria-label="Search work sheet"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setQuery("")}
              placeholder="Search task, client, remark"
              className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#0d1b3e] outline-none placeholder:text-[#8a97b5]"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="flex text-[#546490]">
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          <Popover open={!!filterMenu} onOpenChange={(o) => setFilterMenu(o ? "fields" : null)}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-haspopup="menu"
                className="flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-[13px] font-medium hover:!bg-[#f0f0fd]"
                style={{
                  background: activeFields.length ? C.b50 : "#fff",
                  color: activeFields.length ? C.b700 : C.n700,
                  boxShadow: `inset 0 0 0 1px ${activeFields.length ? C.b200 : C.n200}`,
                }}
              >
                <Filter className="h-3.5 w-3.5" />
                {activeFields.length ? `Filter · ${activeFields.length}` : "Filter"}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className={MENU}>
              {filterMenu === "fields" ? (
                <div className="flex flex-col gap-px p-1.5">
                  <div className={MENU_LABEL}>Filter rows by</div>
                  {FIELDS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setFilterMenu(f.key)}
                      className={`${MENU_ITEM} h-[34px]`}
                    >
                      <Filter className="h-3.5 w-3.5 text-[#546490]" />
                      <span className="flex-1">{f.label}</span>
                      {filters[f.key]?.length > 0 && (
                        <span className="h-[18px] rounded-full bg-[#2b2bb5] px-1.5 text-[11px] font-semibold leading-[18px] text-white">
                          {filters[f.key].length}
                        </span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 text-[#8a97b5]" />
                    </button>
                  ))}
                </div>
              ) : (
                filterMenu && (
                  <ValuesPanel
                    title={FIELDS.find((f) => f.key === filterMenu).label}
                    values={valuesFor(filterMenu)}
                    selected={filters[filterMenu] || []}
                    onToggle={(v) => toggleFilter(filterMenu, v)}
                    onClear={() => setFilters((f) => ({ ...f, [filterMenu]: [] }))}
                    onDone={() => setFilterMenu(null)}
                    onBack={() => setFilterMenu("fields")}
                  />
                )
              )}
            </PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-8 items-center gap-1.5 rounded-[7px] bg-white px-2.5 text-[13px] text-[#4a5878] hover:bg-[#f9fafb]"
                style={control}
              >
                <LayoutList className="h-3.5 w-3.5" />
                Group: {GROUPS.find(([k]) => k === groupBy)[1]}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={4} className={`${MENU} w-[200px]`}>
              <div className="flex flex-col gap-px p-1.5">
                <div className={MENU_LABEL}>Group rows by</div>
                {GROUPS.map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      setGroupBy(k);
                      setCollapsed({});
                    }}
                    className={MENU_ITEM}
                  >
                    <span className="flex-1">{label}</span>
                    {groupBy === k && <Check className="h-3.5 w-3.5 text-[#2b2bb5]" />}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {groupBy !== "none" && groups.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="h-8 rounded-[7px] px-2.5 text-[13px] font-medium text-[#4a5878] hover:bg-[#f9fafb]"
            >
              {allCollapsed ? "Expand all" : "Collapse all"}
            </button>
          )}

          <div className="flex-1" />
          <span className="text-[12px] text-[#546490]">
            {visible.length.toLocaleString("en-IN")} of {monthCount.toLocaleString("en-IN")} rows
          </span>
        </div>

        {(activeFields.length > 0 || query) && (
          <div
            className="flex flex-wrap items-center gap-1.5 px-3 py-2 md:px-5"
            style={{ background: C.n50, boxShadow: `inset 0 -1px 0 ${C.cellLine}` }}
          >
            {activeFields.map((f) => {
              const vals = filters[f.key];
              const shown = vals.map((x) => (f.key === "follow" ? (x === "Due" ? "Due by this day" : x) : x));
              return (
                <div
                  key={f.key}
                  className="flex h-7 items-center overflow-hidden rounded-[7px] bg-white text-[12px]"
                  style={{ boxShadow: `inset 0 0 0 1px ${C.b200}` }}
                >
                  <button
                    type="button"
                    onClick={() => setFilterMenu(f.key)}
                    className="flex h-full items-center gap-1 pl-2.5 pr-1.5 hover:bg-[#f0f0fd]"
                  >
                    <Filter className="h-3 w-3 text-[#2b2bb5]" />
                    <span className="text-[#4a5878]">{f.label}</span>
                    <span className="text-[#546490]">{vals.length > 1 ? "is any of" : "is"}</span>
                    <span className="font-semibold text-[#1a1a8a]">
                      {shown.length > 2 ? `${shown.slice(0, 2).join(", ")} +${shown.length - 2}` : shown.join(", ")}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Remove"
                    onClick={() => setFilters((cur) => ({ ...cur, [f.key]: [] }))}
                    className="flex h-full w-[26px] items-center justify-center text-[#546490] hover:bg-[#f0f0fd] hover:text-[#1a1a8a]"
                    style={{ boxShadow: `inset 1px 0 0 ${C.b100}` }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              onClick={clearFilters}
              className="h-7 px-2 text-[12px] font-medium text-[#546490] hover:text-[#0d1b3e]"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      <WorksheetFormulaBar
        label={activeTask ? `${activeView.id} · ${activeCol.label}` : null}
        value={formulaValue}
        activeRow={activeTask ? flatRows.findIndex((t) => t.id === activeTask.id) : null}
        activeCol={activeCol ? COLS.indexOf(activeCol) : null}
        editable={formulaEditable}
        placeholder={activeTask ? "" : "Select a cell to see its value"}
        onCommit={(text) => activeTask && commitText(activeTask, activeCol.key, text)}
        onFinish={(move) => {
          if (move === "down") moveCell(1, 0);
          else if (move === "up") moveCell(-1, 0);
          else if (move === "right") moveCell(0, 1);
          else if (move === "left") moveCell(0, -1);
          focusGrid();
        }}
      />

      <div className="relative min-h-0 flex-1">
        <div
          ref={gridRef}
          tabIndex={0}
          onKeyDown={onGridKey}
          className="h-full overflow-auto outline-none"
          style={{ userSelect: "none" }}
        >
          <div role="grid" aria-label="Management sheet" style={{ width: "max-content", minWidth: "100%" }}>
            <div
              role="row"
              style={{
                display: "grid",
                gridTemplateColumns: GRID,
                height: 34,
                position: "sticky",
                top: 0,
                zIndex: 4,
                background: C.n50,
              }}
            >
              <span
                style={{
                  position: "sticky",
                  left: 0,
                  zIndex: 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: C.n50,
                  boxShadow: `inset -1px -1px 0 ${C.line}`,
                }}
              >
                <Checkbox
                  on={allVisSel}
                  partial={someVisSel}
                  label="Select all rows"
                  onClick={() =>
                    setSel((s) => {
                      const next = { ...s };
                      visIds.forEach((id) => (next[id] = !allVisSel));
                      return next;
                    })
                  }
                />
              </span>
              {COLS.map(headerCell)}
            </div>

            {loading && (
              <div className="sticky left-0 w-[min(100vw,720px)] px-5 py-12 text-center text-[13px] text-[#546490]">
                Loading the Management sheet…
              </div>
            )}

            {!loading &&
              groups.map((g) => {
                const open = !collapsed[g.key];
                const delayed = g.rows.filter((t) => t.status === "Delayed" || views.get(t.id).late > 0).length;
                return (
                  <div role="rowgroup" key={g.key}>
                    {groupBy !== "none" && (
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setCollapsed((c) => ({ ...c, [g.key]: open }))}
                        className="block w-full bg-white text-left hover:bg-[#f9fafb]"
                        style={{ height: 32, padding: 0, border: "none", boxShadow: `inset 0 -1px 0 ${C.line}` }}
                      >
                        <span
                          style={{
                            position: "sticky",
                            left: 0,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            height: 32,
                            padding: "0 12px",
                          }}
                        >
                          {open ? (
                            <ChevronDown className="h-3.5 w-3.5 text-[#546490]" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-[#546490]" />
                          )}
                          {groupBy === "owner" ? (
                            <Avatar name={g.name} size={22} fontSize={10} />
                          ) : (
                            <span style={{ width: 8, height: 8, borderRadius: 9999, background: C.n400 }} />
                          )}
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.n900 }}>{g.name}</span>
                          <span
                            style={{
                              whiteSpace: "nowrap",
                              font: `500 11px/16px ${MANROPE}`,
                              color: C.n700,
                              background: C.n100,
                              padding: "2px 8px",
                              borderRadius: 9999,
                            }}
                          >
                            {g.rows.length} {g.rows.length === 1 ? "task" : "tasks"}
                            {delayed ? ` · ${delayed} delayed` : ""}
                          </span>
                        </span>
                      </button>
                    )}
                    {open &&
                      g.rows.map((t) => {
                        const v = views.get(t.id);
                        const ri = flatRows.indexOf(t);
                        const isSel = !!sel[t.id];
                        const rowAct = cell?.r === t.id;
                        return (
                          <div
                            key={t.id}
                            role="row"
                            data-rowid={t.id}
                            aria-selected={isSel}
                            className={`group/row ${isSel ? "" : "hover:bg-[#f9fafb]"}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: GRID,
                              height: 40,
                              background: isSel ? C.b50 : "#fff",
                              fontSize: 13,
                              lineHeight: "18px",
                              position: "relative",
                              zIndex: 0,
                            }}
                          >
                            <span
                              onMouseDown={(e) => {
                                e.preventDefault();
                                toggleRow(t.id, e.shiftKey);
                              }}
                              title="Click or Shift+click to select several"
                              style={{
                                position: "sticky",
                                left: 0,
                                zIndex: 2,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                paddingLeft: 14,
                                boxSizing: "border-box",
                                background: rowAct ? C.b100 : isSel ? C.b50 : C.n50,
                                boxShadow: `inset -1px -1px 0 ${C.line}`,
                                cursor: "pointer",
                              }}
                            >
                              <Checkbox on={isSel} label="Select row" />
                            </span>
                            {COLS.map((col, ci) => renderCell(t, v, col, ri, ci))}
                          </div>
                        );
                      })}
                  </div>
                );
              })}

            {!loading && !visible.length && (
              <div
                className="sticky left-0 flex flex-col items-center gap-2 px-5 py-12 text-center"
                style={{ width: "min(100vw, 720px)" }}
              >
                {dayTasks.length ? (
                  <>
                    <span className="text-[14px] font-semibold text-[#0d1b3e]">No rows match</span>
                    <span className="text-[13px] text-[#546490]">Try a different search or clear filters.</span>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-1 h-8 rounded-[7px] bg-[#f5f6f8] px-3.5 text-[13px] font-semibold text-[#4a5878] hover:bg-[#eef0f3]"
                      style={control}
                    >
                      Clear filters
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-[14px] font-semibold text-[#0d1b3e]">
                      {allDays ? "No tasks this month" : "No tasks open on this day"}
                    </span>
                    <span className="text-[13px] text-[#546490]">
                      {canEdit ? "Use Add row to start one." : "Pick another day or month."}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {selIds.length > 0 && canEdit && (
          <div
            role="toolbar"
            aria-label="Row actions"
            className="absolute bottom-5 left-1/2 z-[46] flex w-max max-w-[calc(100%-32px)] -translate-x-1/2 flex-wrap items-center justify-center gap-0.5 whitespace-nowrap rounded-[12px] p-1.5 text-[13px] text-white"
            style={{ background: C.n900, boxShadow: "0 6px 25px rgba(13,28,61,0.2)" }}
          >
            <span
              className="mr-1 flex h-8 items-center gap-1.5 pl-2 pr-3"
              style={{ boxShadow: "inset -1px 0 0 rgb(56,66,84)" }}
            >
              <span
                className="h-5 min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5"
                style={{ background: C.b500 }}
              >
                {selIds.length}
              </span>
              <span className="font-medium" style={{ color: "rgb(200,213,240)" }}>
                {selIds.length === 1 ? "row selected" : "rows selected"}
              </span>
            </span>
            <button
              type="button"
              onClick={bulkDuplicate}
              className="flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium hover:bg-[rgb(36,46,61)]"
            >
              <Copy className="h-3.5 w-3.5" />
              Duplicate
            </button>
            <Popover open={statusMenu} onOpenChange={setStatusMenu}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-haspopup="menu"
                  className="flex h-8 items-center gap-1.5 rounded-[7px] pl-2.5 pr-2 text-[12px] font-medium hover:bg-[rgb(36,46,61)]"
                >
                  <Check className="h-3.5 w-3.5" />
                  Apply status
                  <ChevronDown className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" sideOffset={10} className={`${MENU} w-[200px]`}>
                <div className="flex flex-col gap-px p-1.5">
                  {(options.statuses || []).map((s) => (
                    <button key={s} type="button" onClick={() => bulkStatus(s)} className={MENU_ITEM}>
                      <span
                        style={{ width: 8, height: 8, borderRadius: 9999, background: BADGE[STATUS_BADGE[s] || "Neutral"].dot }}
                      />
                      {s}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex h-8 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-medium hover:bg-[rgba(239,68,68,0.18)]"
              style={{ color: "rgb(252,165,165)" }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
            <span className="mx-1 h-5 w-px" style={{ background: "rgb(56,66,84)" }} />
            <button
              type="button"
              aria-label="Clear selection"
              onClick={() => setSel({})}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] hover:bg-[rgb(36,46,61)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <ConfirmDeleteModal
        open={confirmDelete}
        onClose={() => !deleting && setConfirmDelete(false)}
        onConfirm={bulkDelete}
        title={`Delete ${selIds.length} selected row${selIds.length === 1 ? "" : "s"}?`}
        description="These tasks and their remarks will be permanently removed."
        warning="This action cannot be undone."
        confirmLabel="Delete Rows"
        loading={deleting}
      />
    </>
  );
}

export default ProjectsSheet;
