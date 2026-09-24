import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bug,
  Building2,
  CheckSquare,
  Clock,
  FileText,
  Folder,
  FolderPlus,
  Keyboard,
  Search,
  TriangleAlert,
  UserPlus,
} from "lucide-react";

import { useUser } from "@/context/UserContext";
import { useAccess } from "@/hooks/useAccess";
import { getClients, getProjects, getWorkItems } from "@/services/api";
import { getNavItems } from "./navItems";

const KBD =
  "inline-flex h-5 items-center rounded px-1.5 text-[10px] font-semibold text-slate-500 shadow-[inset_0_0_0_1px_rgba(234,238,244,1)]";

const GROUP_ORDER = [
  "Go to",
  "Actions",
  "Projects",
  "Clients",
  "Work sheet rows",
];

const ROW_SEARCH_DELAY_MS = 220;
const MIN_ROW_QUERY = 2;

// ⌘K "search or jump to" modal. What it offers depends on the person's role
// (lib/permissions.js): nobody is shown a page or action they can't use.
export const CommandPalette = ({ open, onClose, actions }) => {
  const { currentUserId } = useUser();
  const access = useAccess();

  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [projects, setProjects] = useState(null);
  const [clients, setClients] = useState(null);
  const [rows, setRows] = useState([]);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Fresh state each time it opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      setRows([]);
    }
  }, [open]);

  // Projects (everyone) and clients (admins) are loaded once, the first
  // time the palette is opened, so typing filters instantly afterwards.
  useEffect(() => {
    if (!open || !currentUserId) return;

    if (projects === null && access.canViewProjects) {
      getProjects(currentUserId, { include_deliverables: false })
        .then((data) => setProjects(Array.isArray(data) ? data : []))
        .catch(() => setProjects([]));
    }

    if (clients === null && access.canViewClients) {
      getClients()
        .then((data) => setClients(Array.isArray(data) ? data : []))
        .catch(() => setClients([]));
    }
  }, [open, currentUserId, access, projects, clients]);

  // Work sheet rows are searched on the server (there can be thousands),
  // debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < MIN_ROW_QUERY || !currentUserId) {
      setRows([]);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      getWorkItems(currentUserId, { search: q, limit: 6 })
        .then((data) => !cancelled && setRows(Array.isArray(data) ? data : []))
        .catch(() => !cancelled && setRows([]));
    }, ROW_SEARCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, currentUserId]);

  const items = useMemo(() => {
    const nav = getNavItems(access).map((item) => ({
      group: "Go to",
      id: `nav-${item.key}`,
      label: item.label,
      icon: item.icon,
      keys: `G ${item.chord}`,
      run: () => actions.goTo(item.to),
    }));

    const acts = [
      access.canLogWork && {
        id: "quick-log",
        label: "Quick log",
        icon: Clock,
        keys: "L",
        run: actions.quickLog,
      },
      access.canLogWork && {
        id: "add-row",
        label: "Add work sheet row",
        icon: FileText,
        run: actions.addRow,
      },
      access.canManageProjects && {
        id: "new-project",
        label: "New project",
        icon: FolderPlus,
        run: actions.newProject,
      },
      access.canManageClients && {
        id: "add-client",
        label: "Add client",
        icon: Building2,
        run: actions.addClient,
      },
      access.canManageTeam && {
        id: "add-member",
        label: "Add team member",
        icon: UserPlus,
        run: actions.addMember,
      },
      access.canViewApprovals && {
        id: "approvals",
        // Only managers can act on approvals; everyone else just looks.
        label: access.canActOnApprovals
          ? "Review pending approvals"
          : "View pending approvals",
        icon: CheckSquare,
        run: () => actions.goTo("/approvals"),
      },
      access.canViewWorksheet && {
        id: "missing",
        label: "Show rows missing a deliverable",
        icon: TriangleAlert,
        run: actions.showMissing,
      },
      {
        id: "bug",
        label: "Report a bug",
        icon: Bug,
        run: actions.reportBug,
      },
      {
        id: "shortcuts",
        label: "Keyboard shortcuts",
        icon: Keyboard,
        keys: "?",
        run: actions.showShortcuts,
      },
    ]
      .filter(Boolean)
      .map((a) => ({ group: "Actions", ...a }));

    const q = query.trim().toLowerCase();
    if (!q) return [...nav, ...acts];

    const matches = (item) =>
      `${item.label} ${item.meta || ""}`.toLowerCase().includes(q);

    const projectItems = (projects || [])
      .map((p) => ({
        group: "Projects",
        id: `project-${p.id}`,
        label: p.name,
        meta: p.client_name || "",
        icon: Folder,
        run: () => actions.goTo(`/projects/${p.id}`),
      }))
      .filter(matches);

    const clientItems = (clients || [])
      .map((c) => ({
        group: "Clients",
        id: `client-${c.id}`,
        label: c.name,
        icon: Building2,
        run: () => actions.searchWorksheet(c.name),
      }))
      .filter(matches);

    const rowItems = rows.map((r) => ({
      group: "Work sheet rows",
      id: `row-${r.id}`,
      label: r.deliverable_name || "Untitled deliverable",
      meta: r.stage || "",
      icon: FileText,
      run: () => actions.searchWorksheet(r.deliverable_name || ""),
    }));

    return [
      ...nav.filter(matches),
      ...acts.filter(matches),
      ...projectItems.slice(0, 6),
      ...clientItems.slice(0, 5),
      ...rowItems,
    ].slice(0, 20);
  }, [access, actions, query, projects, clients, rows]);

  const activeIndex = Math.min(index, Math.max(0, items.length - 1));

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-cmd-index="${activeIndex}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, items.length]);

  if (!open) return null;

  const run = (item) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex(Math.min(items.length - 1, activeIndex + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex(Math.max(0, activeIndex - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(items[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  // Items are rendered grouped, but navigated with one flat index.
  const grouped = GROUP_ORDER.map((title) => ({
    title,
    entries: items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.group === title),
  })).filter((g) => g.entries.length > 0);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-[rgba(12,12,13,0.1)] px-4 pt-[12vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command menu"
        className="flex w-[620px] max-w-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(234,238,244,1),0_15px_25px_rgba(13,28,61,0.12)]"
      >
        <div className="flex h-[52px] items-center gap-2.5 px-4 shadow-[inset_0_-1px_0_rgba(234,238,244,1)]">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            autoFocus
            data-testid="command-palette-input"
            aria-label="Type a command or search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Type a command, page, project or client"
            className="min-w-0 flex-1 border-none bg-transparent text-[15px] text-slate-900 outline-none placeholder:text-slate-400"
          />
          <span className={KBD}>Esc</span>
        </div>

        <div ref={listRef} className="max-h-[380px] overflow-y-auto p-1.5">
          {grouped.map((group) => (
            <div key={group.title} className="flex flex-col gap-px pb-1.5">
              <div className="px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase leading-[14px] tracking-[0.05em] text-slate-500">
                {group.title}
              </div>

              {group.entries.map(({ item, i }) => {
                const Icon = item.icon;
                const active = i === activeIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    data-cmd-index={i}
                    onClick={() => run(item)}
                    onMouseEnter={() => setIndex(i)}
                    className={[
                      "flex h-9 items-center gap-2.5 rounded-[7px] px-2.5 text-left text-sm",
                      active
                        ? "bg-[#f0f0fd] text-[#1a1a8a]"
                        : "bg-transparent text-slate-900",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.meta && (
                      <span className="text-xs text-slate-500">{item.meta}</span>
                    )}
                    {item.keys && <span className={KBD}>{item.keys}</span>}
                  </button>
                );
              })}
            </div>
          ))}

          {items.length === 0 && (
            <div className="p-7 text-center text-[13px] text-slate-500">
              No matches for “{query}”
            </div>
          )}
        </div>

        <div className="flex h-9 items-center gap-3.5 bg-[#f9fafb] px-4 text-xs text-slate-500 shadow-[inset_0_1px_0_rgba(234,238,244,1)]">
          <span>↑ ↓ to move</span>
          <span>Enter to open</span>
          <span className="flex-1" />
          <span>
            {items.length} result{items.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
};

