import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  Building,
  User as UserIcon,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  Pencil,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import { useAccess } from "@/hooks/useAccess";
import {
  getProject,
  getProjectWorkLog,
  getOptions,
  updateProject,
  deleteProject,
  getClients,
  getWorksheetLookups,
  updateDeliverable,
} from "@/services/api";
import { findLookalikes } from "@/lib/lookalikes";
import { PROJECT_STATUSES, STAGES } from "@/constants/projectPalette";
import { APP_ACTIONS, requestAppAction } from "@/lib/appActions";
import { DeliverableModal } from "@/components/projects/DeliverableModal";
import { ImportDeliverablesModal } from "@/components/projects/ImportDeliverablesModal";
import ProjectEditModal from "@/components/projects/ProjectEditModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { QuickLogTrigger } from "@/components/work-sheet/QuickLogTrigger";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trackEvent } from "../analytics";
import { ProjectDetailSkeleton } from "@/components/skeletons/Skeletons";

// Colours from the redesign's Mint design system tokens.
const BRAND_500 = "rgb(43,43,181)";
const INFO_500 = "rgb(59,130,246)";
const WARNING_500 = "rgb(245,158,11)";
const SUCCESS_500 = "rgb(16,185,129)";
const NEUTRAL_400 = "rgb(138,151,181)";
const NEUTRAL_900 = "rgb(13,27,62)";

const STAGE_DOT = {
  Content: BRAND_500,
  Design: INFO_500,
  Animate: WARNING_500,
};

const PROJECT_STATUS_DOT = {
  Active: BRAND_500,
  "Approval Pending": WARNING_500,
  Completed: SUCCESS_500,
  "Ready for Invoice": SUCCESS_500,
  "Raised Invoice": INFO_500,
  "On Hold": WARNING_500,
  Scrapped: NEUTRAL_400,
};

// Mint "Badge" (type Dot, size sm) colour sets.
const BADGE = {
  Neutral: { bg: "rgb(245,246,248)", ring: "rgb(239,240,242)", fg: "rgb(74,88,120)", dot: NEUTRAL_400 },
  Brand: { bg: "rgb(240,240,253)", ring: "rgb(240,240,253)", fg: "rgb(26,26,138)", dot: BRAND_500 },
  Info: { bg: "rgb(219,234,254)", ring: "rgb(219,234,254)", fg: "rgb(30,64,175)", dot: INFO_500 },
  Warning: { bg: "rgb(254,243,199)", ring: "rgb(254,243,199)", fg: "rgb(146,64,14)", dot: WARNING_500 },
  Success: { bg: "rgb(209,250,229)", ring: "rgb(209,250,229)", fg: "rgb(0,91,75)", dot: SUCCESS_500 },
  Error: { bg: "rgb(255,245,245)", ring: "rgb(255,245,245)", fg: "rgb(239,68,68)", dot: "rgb(239,68,68)" },
};

// A deliverable's stage_status is derived by the backend from the work sheet,
// so it is shown read-only here, in the redesign's wording.
const DELIVERABLE_STATUSES = [
  { key: "Not Started", label: "Not started", badge: "Neutral" },
  { key: "In Progress", label: "In progress", badge: "Brand" },
  { key: "Ready for Review", label: "In review", badge: "Info" },
  { key: "Changes Requested", label: "Changes requested", badge: "Warning" },
  { key: "Completed", label: "Done", badge: "Success" },
];
const DELIVERABLE_STATUS = Object.fromEntries(
  DELIVERABLE_STATUSES.map((s) => [s.key, s])
);

const WORK_STATUS_BADGE = {
  "Not Started": "Neutral",
  Ongoing: "Brand",
  "On Hold": "Warning",
  "Ready for Review": "Info",
  "Changes Requested": "Warning",
  Rework: "Error",
  Closed: "Success",
  Scrap: "Error",
};

const DELIV_GRID =
  "grid grid-cols-[minmax(260px,2.2fr)_210px_170px_minmax(130px,1fr)] gap-x-4";
const LOG_GRID =
  "grid grid-cols-[190px_minmax(220px,2fr)_110px_70px_120px] gap-x-4";

const HAIRLINE = "shadow-[inset_0_0_0_1px_rgb(234,238,244)]";
const HEAD_ROW =
  "h-[38px] items-center bg-[rgb(249,250,251)] px-4 text-xs font-semibold text-[rgb(74,88,120)] shadow-[inset_0_1px_0_rgb(234,238,244),inset_0_-1px_0_rgb(226,232,240)]";
const MENU =
  "w-[200px] rounded-xl border-0 bg-white p-1.5 shadow-[0_0_0_1px_rgb(234,238,244),0_6px_25px_rgba(13,28,61,0.12)]";
const MENU_ITEM =
  "flex h-8 cursor-pointer items-center gap-2 rounded-[7px] px-2 text-[13px] text-[rgb(13,27,62)] focus:bg-[rgb(240,240,253)] focus:text-[rgb(13,27,62)]";
const ICON_BTN =
  "flex h-[34px] w-[34px] items-center justify-center rounded-[7px] bg-white text-[rgb(74,88,120)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] hover:bg-[rgb(249,250,251)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgb(220,220,248)]";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "2026-09-02" / ISO timestamps -> { d: "02", m: "Sep", y: 2026 }, read as a
// calendar date so no timezone can shift it by a day.
const parts = (iso) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!match) return null;
  const [, y, m, d] = match;
  return { y: Number(y), m: MONTHS[Number(m) - 1], mi: Number(m), d };
};

// "01 Sep → 10 Oct 2026"
const fmtRange = (start, end) => {
  const s = parts(start);
  const e = parts(end);
  if (!s && !e) return "No dates";
  if (!e) return `From ${s.d} ${s.m} ${s.y}`;
  if (!s) return `Due ${e.d} ${e.m} ${e.y}`;
  const from = s.y === e.y ? `${s.d} ${s.m}` : `${s.d} ${s.m} ${s.y}`;
  return `${from} → ${e.d} ${e.m} ${e.y}`;
};

// "02–04 Sep", "28 Sep – 03 Oct", "due 04 Sep"
const fmtWindow = (start, end) => {
  const s = parts(start);
  const e = parts(end);
  if (!s && !e) return "Not scheduled";
  if (!s) return `due ${e.d} ${e.m}`;
  if (!e) return `from ${s.d} ${s.m}`;
  if (s.y === e.y && s.mi === e.mi) {
    return s.d === e.d ? `${s.d} ${s.m}` : `${s.d}–${e.d} ${e.m}`;
  }
  return `${s.d} ${s.m} – ${e.d} ${e.m}`;
};

// "Mon, 28 Sep"
const fmtDay = (iso) => {
  const p = parts(iso);
  if (!p) return "No date";
  const weekday = WEEKDAYS[new Date(p.y, p.mi - 1, Number(p.d)).getDay()];
  return `${weekday}, ${p.d} ${p.m}`;
};

// 40h 35m / 2h / 30m
const fmtMin = (minutes) => {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return (h ? `${h}h` : "") + (h && r ? " " : "") + (r || !h ? `${r}m` : "");
};

const initials = (name) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const todayIso = () => new Date().toISOString().slice(0, 10);

// Deliverables imported as already finished (import status "Finish") are stored
// by older imports as current_stage "Finish" + stage_status "Closed". Show them
// where newer imports put them: at the last of their own stages, as Completed.
const stageOf = (d) => {
  if (STAGES.includes(d.current_stage)) return d.current_stage;
  const own = (d.required_stages || []).filter((s) => STAGES.includes(s));
  return own[own.length - 1] || "Content";
};
const statusOf = (d) =>
  d.stage_status === "Closed" ? "Completed" : d.stage_status || "Not Started";

const stageWindow = (d) => {
  const w = d.stage_schedule?.[d.current_stage];
  if (w) return { start: w.start_dt, end: w.end_dt };
  return { start: d.start_dt, end: d.end_dt };
};

// Mirrors the backend's per-stage overdue check (server.py's
// _ensure_overdue_notifications) so the schedule reads "late" right away.
const isOverdue = (d) => {
  if (statusOf(d) === "Completed") return false;
  const end = d.stage_schedule?.[d.current_stage]?.end_dt;
  return Boolean(end) && end.slice(0, 10) < todayIso();
};

const Dot = ({ color, size = 8 }) => (
  <span
    className="shrink-0 rounded-full"
    style={{ width: size, height: size, background: color }}
  />
);

const Badge = ({ color = "Neutral", children }) => {
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

const CountPill = ({ children, className = "" }) => (
  <span
    className={`rounded-full bg-[rgb(245,246,248)] font-['Manrope','Inter',sans-serif] text-[11px] font-medium leading-4 text-[rgb(74,88,120)] ${className}`}
  >
    {children}
  </span>
);

const Avatar = ({ name, size = 24 }) => (
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
const DeliverableNameInput = ({ name, onSave }) => {
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

const GroupHeader = ({ open, onToggle, dot, name, meta }) => (
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

export default function ProjectDetailPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const {
    currentUser,
    currentUserId,
    users,
    loading: userLoading,
  } = useUser();

  const access = useAccess();
  // Everyone can open a project; only admins can change it.
  const canManage = access.canManageProjects;
  const canLogWork = access.canLogWork;

  const [project, setProject] = useState(null);
  const [workItems, setWorkItems] = useState([]);
  const [workLogTotal, setWorkLogTotal] = useState(0);
  const [loggedMinutes, setLoggedMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("deliverables");
  const [stageFilter, setStageFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [closedGroups, setClosedGroups] = useState({});
  const [delivModal, setDelivModal] = useState({
    open: false,
    mode: "add",
    initial: null,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [deliverableTypes, setDeliverableTypes] = useState([]);
  const [clients, setClients] = useState([]);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [deleteProjectOpen, setDeleteProjectOpen] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  // Other projects with names easy to confuse with this one, warned about
  // under the title so the team checks the project code when logging.
  const [lookalikes, setLookalikes] = useState([]);

  const fetchAll = async () => {
    setLoading(true);

    try {
      // One slim work-log query (the server merges the project_id and
      // deliverable_id matches itself) instead of two full /work-items
      // downloads. Clients are only needed by the edit-project modal, so they
      // load on demand (see the effect below), not on every page open.
      const [p, workLog, options] = await Promise.all([
        getProject(currentUserId, projectId),
        getProjectWorkLog(currentUserId, projectId),
        getOptions(),
      ]);

      const items = workLog.items || [];
      setProject(p);
      setWorkItems(items);
      setWorkLogTotal(workLog.total ?? items.length);
      setLoggedMinutes(
        workLog.total_minutes ??
          items.reduce((sum, w) => sum + (Number(w.time_taken_minutes) || 0), 0)
      );
      setDeliverableTypes(options.deliverable_types || []);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to load project");
    } finally {
      setLoading(false);
    }
  };

  // The Work Sheet's slim lookup (names, clients, codes) is enough to find
  // look-alike project names; a failure just means no warning is shown.
  useEffect(() => {
    if (!project?.id) return undefined;
    let cancelled = false;
    getWorksheetLookups()
      .then((data) => {
        if (cancelled) return;
        const names = new Map((data?.clients || []).map((c) => [c.id, c.name]));
        setLookalikes(
          findLookalikes(project, data?.projects || [], (id) => names.get(id) || "")
        );
      })
      .catch(() => !cancelled && setLookalikes([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, project?.name, project?.client_id]);

  useEffect(() => {
    if (!editProjectOpen || clients.length) return;
    getClients()
      .then((data) => setClients(data || []))
      .catch(() => toast.error("Could not load clients"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editProjectOpen]);

  // Lightweight refresh for edits that only change the project or its
  // deliverables. No loading flag: the page stays put instead of flashing a
  // skeleton.
  const refreshProject = async () => {
    try {
      setProject(await getProject(currentUserId, projectId));
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to refresh project");
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchAll();

      trackEvent("project_detail_opened", {
        project_id: projectId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, currentUserId]);

  const handleStatusChange = async (status) => {
    if (status === project.status) return;
    try {
      const updated = await updateProject(currentUserId, projectId, { status });

      trackEvent("project_status_changed", {
        project_id: projectId,
        to_status: status,
      });

      setProject((p) => ({ ...p, ...updated }));
      toast.success(`Project marked ${status.toLowerCase()}`);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Update failed");
    }
  };

  const setDeliverableName = (id, name) =>
    setProject((p) => ({
      ...p,
      deliverables: (p.deliverables || []).map((x) =>
        x.id === id ? { ...x, name } : x
      ),
    }));

  const handleRename = async (deliverable, name) => {
    const previous = deliverable.name;
    setDeliverableName(deliverable.id, name);
    try {
      await updateDeliverable(currentUserId, deliverable.id, { name });
      toast.success("Deliverable renamed");
    } catch (err) {
      setDeliverableName(deliverable.id, previous);
      toast.error(err?.response?.data?.detail || "Could not rename deliverable");
    }
  };

  const handleProjectEditSave = async (updates) => {
    await updateProject(currentUserId, projectId, updates);
    await refreshProject();
  };

  const handleProjectDelete = async () => {
    setDeletingProject(true);

    try {
      await deleteProject(currentUserId, projectId);

      toast.success("Project deleted");
      navigate("/projects");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not delete project");
    } finally {
      setDeletingProject(false);
    }
  };

  // The quick logger lives on the work sheet; open it there.
  const openQuickLog = () => {
    requestAppAction(APP_ACTIONS.QUICK_LOG);
    navigate("/");
  };

  const deliverables = useMemo(() => project?.deliverables || [], [project]);
  const userName = useMemo(
    () => Object.fromEntries((users || []).map((u) => [u.id, u.name])),
    [users]
  );

  const q = query.trim().toLowerCase();

  const deliverableGroups = useMemo(() => {
    const filtered = deliverables.filter(
      (d) =>
        (stageFilter === "all" || stageOf(d) === stageFilter) &&
        (!q || `${d.name} ${d.type || ""}`.toLowerCase().includes(q))
    );
    return STAGES.map((stage) => {
      const rows = filtered.filter((d) => stageOf(d) === stage);
      return {
        stage,
        rows,
        done: rows.filter((d) => statusOf(d) === "Completed").length,
      };
    }).filter((g) => g.rows.length);
  }, [deliverables, stageFilter, q]);

  const workGroups = useMemo(() => {
    const filtered = workItems.filter(
      (w) =>
        !q ||
        `${w.deliverable_name || ""} ${userName[w.creator_id] || ""} ${w.stage || ""}`
          .toLowerCase()
          .includes(q)
    );
    const byDate = new Map();
    filtered.forEach((w) => {
      const key = w.work_date || "";
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(w);
    });
    return [...byDate.entries()].map(([date, rows]) => ({
      date,
      rows,
      minutes: rows.reduce((sum, w) => sum + (Number(w.time_taken_minutes) || 0), 0),
    }));
  }, [workItems, q, userName]);

  const people = useMemo(() => {
    const totals = new Map();
    workItems.forEach((w) => {
      const name = userName[w.creator_id] || "Unknown";
      totals.set(name, (totals.get(name) || 0) + (Number(w.time_taken_minutes) || 0));
    });
    const sum = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
    return [...totals.entries()]
      .map(([name, minutes]) => ({ name, minutes, pct: Math.round((minutes / sum) * 100) }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [workItems, userName]);

  if (userLoading || !currentUser) return null;

  if (loading || !project) {
    return <ProjectDetailSkeleton />;
  }

  const total = deliverables.length;
  const done = deliverables.filter((d) => statusOf(d) === "Completed").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const segments = DELIVERABLE_STATUSES.map((s) => ({
    ...s,
    n: deliverables.filter((d) => statusOf(d) === s.key).length,
    color: BADGE[s.badge].dot,
  })).filter((s) => s.n);

  const tiles = ["all", ...STAGES].map((key) => {
    const rows =
      key === "all" ? deliverables : deliverables.filter((d) => stageOf(d) === key);
    return {
      key,
      label: key === "all" ? "All deliverables" : key,
      dot: STAGE_DOT[key] || NEUTRAL_900,
      count: rows.length,
      done: rows.filter((d) => statusOf(d) === "Completed").length,
    };
  });

  const toggleGroup = (key) =>
    setClosedGroups((c) => ({ ...c, [key]: !c[key] }));

  const statusDot = PROJECT_STATUS_DOT[project.status] || BRAND_500;
  const isDeliv = tab === "deliverables";

  return (
    <div
      data-testid="project-detail-page"
      className="flex-1 overflow-auto bg-white font-['Inter',sans-serif] text-[rgb(13,27,62)] antialiased"
    >
      <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-6 pb-16 pt-4">
        {/* Back link + header */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => navigate("/projects")}
            className="-ml-1 flex h-7 items-center gap-1.5 self-start rounded-[7px] pl-1 pr-2 text-[13px] font-medium text-[rgb(84,100,144)] hover:bg-[rgb(249,250,251)] hover:text-[rgb(13,27,62)]"
          >
            <ArrowLeft className="h-4 w-4" />
            All projects
          </button>

          <div className="flex flex-wrap items-start gap-4">
            <div className="flex min-w-[280px] flex-1 flex-col gap-2">
              <h1 className="m-0 text-[28px] font-bold leading-9 text-[rgb(13,27,62)] [text-wrap:pretty]">
                {project.name}
              </h1>
              {project.description && (
                <p className="m-0 text-sm leading-5 text-[rgb(55,65,95)] [text-wrap:pretty]">
                  {project.description}
                </p>
              )}
              {lookalikes.length > 0 && (
                <div
                  data-testid="project-detail-lookalike-warning"
                  className="flex items-start gap-2 self-start rounded-lg bg-amber-100 px-3 py-2 text-xs leading-4 text-[rgb(13,27,62)]"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-800" />
                  <span>
                    Often confused with {lookalikes.map((p) => p.name).join(", ")}.
                    {" Ask the team to check the project name and client when logging."}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-7 gap-y-2.5 pt-1">
                {[
                  { icon: Building, label: "Client", value: project.client_name || "—" },
                  { icon: UserIcon, label: "Point of contact", value: project.client_poc || "Unassigned" },
                  { icon: Calendar, label: "Timeline", value: fmtRange(project.start_date, project.end_date) },
                ].map(({ icon: Icon, label, value }) => (
                  <span key={label} className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[rgb(249,250,251)] text-[rgb(84,100,144)]">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="text-[11px] leading-[14px] text-[rgb(84,100,144)]">{label}</span>
                      <span className="truncate text-[13px] font-medium leading-4 text-[rgb(13,27,62)]">
                        {value}
                      </span>
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canManage && (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="More actions"
                      data-testid="project-detail-more-btn"
                      className={ICON_BTN}
                    >
                      <span className="flex gap-[3px]">
                        <span className="h-[3px] w-[3px] rounded-full bg-current" />
                        <span className="h-[3px] w-[3px] rounded-full bg-current" />
                        <span className="h-[3px] w-[3px] rounded-full bg-current" />
                      </span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={6} className={MENU}>
                    <DropdownMenuItem
                      className={MENU_ITEM}
                      onSelect={() => setEditProjectOpen(true)}
                    >
                      <Pencil className="!h-3.5 !w-3.5" />
                      Edit details
                    </DropdownMenuItem>
                    <DropdownMenuSeparator className="mx-0 my-1 h-px bg-[rgb(234,238,244)]" />
                    <DropdownMenuItem
                      className={`${MENU_ITEM} !text-[rgb(239,68,68)] focus:!bg-[rgb(255,245,245)]`}
                      onSelect={() => setDeleteProjectOpen(true)}
                    >
                      <Trash2 className="!h-3.5 !w-3.5" />
                      Delete project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {canManage ? (
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Project status"
                      data-testid="project-detail-status-select"
                      className="flex h-[34px] items-center gap-2 rounded-[7px] bg-white pl-3 pr-2.5 text-[13px] font-semibold text-[rgb(13,27,62)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] hover:bg-[rgb(249,250,251)] focus:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgb(220,220,248)]"
                    >
                      <Dot color={statusDot} />
                      {project.status}
                      <ChevronDown className="h-3.5 w-3.5 text-[rgb(84,100,144)]" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={6} className={MENU}>
                    {PROJECT_STATUSES.map((s) => (
                      <DropdownMenuItem
                        key={s}
                        className={MENU_ITEM}
                        onSelect={() => handleStatusChange(s)}
                      >
                        <Dot color={PROJECT_STATUS_DOT[s] || BRAND_500} />
                        <span className="flex-1">{s}</span>
                        {s === project.status && (
                          <Check className="!h-3.5 !w-3.5 text-[rgb(43,43,181)]" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="flex h-[34px] items-center gap-2 rounded-[7px] bg-white px-3 text-[13px] font-semibold text-[rgb(13,27,62)] shadow-[inset_0_0_0_1px_rgb(239,240,242)]">
                  <Dot color={statusDot} />
                  {project.status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress + stage tiles */}
        <div className="grid grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] gap-3 overflow-x-auto">
          <div
            className={`flex min-w-0 flex-col gap-3 rounded-xl bg-white p-4 ${HAIRLINE}`}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-2xl font-semibold leading-8 text-[rgb(13,27,62)]">
                {pct}%
              </span>
              <span className="text-[13px] text-[rgb(84,100,144)]">
                {done} of {total} deliverables done · {fmtMin(loggedMinutes)} logged
              </span>
            </div>
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-[rgb(245,246,248)]">
              {segments.map((s) => (
                <span
                  key={s.key}
                  title={s.label}
                  style={{ flex: s.n, background: s.color }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-1.5">
              {segments.map((s) => (
                <span
                  key={s.key}
                  className="flex items-center gap-1.5 text-xs text-[rgb(74,88,120)]"
                >
                  <Dot color={s.color} />
                  {s.label} <span className="text-[rgb(84,100,144)]">{s.n}</span>
                </span>
              ))}
            </div>
          </div>

          {tiles.map((t) => {
            const on = stageFilter === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setStageFilter(t.key);
                  setTab("deliverables");
                }}
                className={`flex min-w-0 flex-col gap-1.5 rounded-xl p-4 text-left transition-[box-shadow,background] duration-100 ${
                  on
                    ? "bg-[rgb(240,240,253)] shadow-[inset_0_0_0_2px_rgb(43,43,181)]"
                    : "bg-white shadow-[inset_0_0_0_1px_rgb(234,238,244)] hover:shadow-[inset_0_0_0_1px_rgb(144,144,236)]"
                }`}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold text-[rgb(74,88,120)]">
                  <Dot color={t.dot} />
                  {t.label}
                </span>
                <span className="text-2xl font-semibold leading-8 text-[rgb(13,27,62)]">
                  {t.count}
                </span>
                <span className="text-xs text-[rgb(84,100,144)]">{t.done} done</span>
              </button>
            );
          })}
        </div>

        {/* Tabs panel */}
        <div className={`flex flex-col overflow-hidden rounded-xl bg-white ${HAIRLINE}`}>
          <div
            role="tablist"
            aria-label="Project sections"
            className="flex items-center gap-1 px-4 shadow-[inset_0_-1px_0_rgb(234,238,244)]"
          >
            {[
              ["deliverables", "Deliverables", total],
              ["log", "Work log", workLogTotal],
            ].map(([key, label, count]) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setTab(key);
                    setQuery("");
                  }}
                  className={`flex h-11 items-center gap-2 px-2.5 text-sm font-semibold ${
                    active
                      ? "text-[rgb(13,27,62)] shadow-[inset_0_-2px_0_rgb(43,43,181)]"
                      : "text-[rgb(84,100,144)]"
                  }`}
                >
                  {label}
                  <CountPill className="px-[7px] py-px">{count}</CountPill>
                </button>
              );
            })}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <label className="flex h-8 min-w-[200px] flex-[0_1_300px] items-center gap-2 rounded-[7px] bg-white px-2.5 text-[rgb(84,100,144)] shadow-[inset_0_0_0_1px_rgb(239,240,242)]">
              <Search className="h-3.5 w-3.5" />
              <input
                aria-label={isDeliv ? "Search deliverables" : "Search work log"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isDeliv ? "Search deliverables" : "Search work log"}
                className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-[rgb(13,27,62)] outline-none placeholder:text-[rgb(84,100,144)]"
              />
            </label>

            {isDeliv && stageFilter !== "all" && (
              <button
                type="button"
                onClick={() => setStageFilter("all")}
                className="flex h-7 items-center gap-1.5 rounded-full bg-[rgb(240,240,253)] pl-2.5 pr-2 text-xs font-semibold text-[rgb(26,26,138)] shadow-[inset_0_0_0_1px_rgb(144,144,236)]"
              >
                Stage: {stageFilter}
                <X className="h-2.5 w-2.5" />
              </button>
            )}

            <span className="flex-1" />

            {isDeliv && canManage && (
              <div className="flex gap-2">
                <button
                  type="button"
                  data-testid="project-detail-import-deliverables-btn"
                  onClick={() => setImportOpen(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[rgb(245,246,248)] px-3.5 text-xs font-semibold leading-4 text-[rgb(74,88,120)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] transition-colors hover:bg-[rgb(243,244,246)] focus:outline-none focus-visible:shadow-[inset_0_0_0_1px_rgb(239,240,242),0_0_0_3px_rgb(220,220,248)]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Import
                </button>
                <button
                  type="button"
                  data-testid="project-detail-add-deliverable-btn"
                  onClick={() => setDelivModal({ open: true, mode: "add", initial: null })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[rgb(43,43,181)] px-3.5 text-xs font-semibold leading-4 text-white transition-colors hover:bg-[rgb(61,61,204)] focus:outline-none focus-visible:shadow-[0_0_0_3px_rgb(220,220,248)]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add deliverable
                </button>
              </div>
            )}

            {!isDeliv && canLogWork && (
              <button
                type="button"
                onClick={openQuickLog}
                className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[rgb(43,43,181)] px-3.5 text-xs font-semibold leading-4 text-white transition-colors hover:bg-[rgb(61,61,204)] focus:outline-none focus-visible:shadow-[0_0_0_3px_rgb(220,220,248)]"
              >
                <Clock className="h-3.5 w-3.5" />
                Log time
              </button>
            )}
          </div>

          {isDeliv ? (
            <div className="overflow-x-auto">
              <div className="min-w-[860px]">
                <div className={`${DELIV_GRID} ${HEAD_ROW}`}>
                  <span>Deliverable</span>
                  <span>Workflow</span>
                  <span>Status</span>
                  <span>Schedule</span>
                </div>

                {deliverableGroups.map((g) => {
                  const key = `d:${g.stage}`;
                  const open = !closedGroups[key];
                  return (
                    <div key={g.stage}>
                      <GroupHeader
                        open={open}
                        onToggle={() => toggleGroup(key)}
                        dot={STAGE_DOT[g.stage]}
                        name={g.stage}
                        meta={`${g.rows.length} · ${g.done} done`}
                      />
                      {open &&
                        g.rows.map((d) => {
                          const status =
                            DELIVERABLE_STATUS[statusOf(d)] ||
                            DELIVERABLE_STATUS["Not Started"];
                          const flow = d.required_stages?.length
                            ? d.required_stages
                            : [d.current_stage];
                          const win = stageWindow(d);
                          const overdue = isOverdue(d);
                          return (
                            <div
                              key={d.id}
                              data-testid={`project-detail-deliverable-${d.id}`}
                              role={canManage ? "button" : undefined}
                              tabIndex={canManage ? 0 : undefined}
                              title={canManage ? "Edit deliverable" : undefined}
                              onClick={
                                canManage
                                  ? () => setDelivModal({ open: true, mode: "edit", initial: d })
                                  : undefined
                              }
                              onKeyDown={
                                canManage
                                  ? (e) => {
                                      if (e.key === "Enter") {
                                        setDelivModal({ open: true, mode: "edit", initial: d });
                                      }
                                    }
                                  : undefined
                              }
                              className={`${DELIV_GRID} min-h-[52px] items-center pl-[34px] pr-4 text-sm shadow-[inset_0_-1px_0_rgb(243,244,246)] hover:bg-[rgb(249,250,251)] ${
                                canManage ? "cursor-pointer focus:bg-[rgb(249,250,251)] focus:outline-none" : ""
                              }`}
                            >
                              <span className="flex min-w-0 flex-col gap-0.5 py-1.5">
                                {canManage ? (
                                  <DeliverableNameInput
                                    name={d.name}
                                    onSave={(name) => handleRename(d, name)}
                                  />
                                ) : (
                                  <span
                                    className="truncate text-sm font-medium leading-[26px] text-[rgb(13,27,62)]"
                                    title={d.name}
                                  >
                                    {d.name}
                                  </span>
                                )}
                                <span className="text-xs text-[rgb(84,100,144)]">
                                  {d.type || "—"}
                                </span>
                              </span>

                              <span className="flex flex-wrap items-center gap-1 text-xs text-[rgb(74,88,120)]">
                                {flow.map((stage, i) => (
                                  <span key={stage} className="flex items-center gap-1">
                                    <span className="flex items-center gap-[5px]">
                                      <Dot color={STAGE_DOT[stage] || NEUTRAL_400} size={6} />
                                      {stage}
                                    </span>
                                    {i < flow.length - 1 && (
                                      <ChevronRight className="h-3 w-3 text-[rgb(138,151,181)]" />
                                    )}
                                  </span>
                                ))}
                              </span>

                              <span className="p-0.5">
                                <Badge color={status.badge}>{status.label}</Badge>
                              </span>

                              <span
                                className={`text-[13px] tabular-nums ${
                                  overdue ? "text-[rgb(239,68,68)]" : "text-[rgb(84,100,144)]"
                                }`}
                                title={overdue ? `${d.current_stage} is overdue` : undefined}
                              >
                                {fmtWindow(win.start, win.end)}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  );
                })}

                {deliverableGroups.length === 0 && (
                  <div className="px-4 py-10 text-center text-[13px] text-[rgb(84,100,144)]">
                    {total === 0 && !q && stageFilter === "all"
                      ? "No deliverables yet."
                      : "No deliverables match this search."}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-start">
              <div className="min-w-0 flex-[1_1_620px] overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className={`${LOG_GRID} ${HEAD_ROW}`}>
                    <span>Member</span>
                    <span>Deliverable</span>
                    <span>Stage</span>
                    <span className="text-right">Time</span>
                    <span>Status</span>
                  </div>

                  {workGroups.map((g) => {
                    const key = `w:${g.date}`;
                    const open = !closedGroups[key];
                    return (
                      <div key={g.date}>
                        <GroupHeader
                          open={open}
                          onToggle={() => toggleGroup(key)}
                          name={fmtDay(g.date)}
                          meta={`${g.rows.length} ${g.rows.length > 1 ? "entries" : "entry"} · ${fmtMin(g.minutes)}`}
                        />
                        {open &&
                          g.rows.map((w) => {
                            const by = userName[w.creator_id] || "—";
                            return (
                              <div
                                key={w.id}
                                className={`${LOG_GRID} min-h-12 items-center pl-[34px] pr-4 text-sm shadow-[inset_0_-1px_0_rgb(243,244,246)] hover:bg-[rgb(249,250,251)]`}
                              >
                                <span className="flex min-w-0 items-center gap-2 text-[13px] text-[rgb(74,88,120)]">
                                  <Avatar name={by} />
                                  <span className="truncate" title={by}>
                                    {by}
                                  </span>
                                </span>
                                <span
                                  className="truncate text-[rgb(13,27,62)]"
                                  title={w.deliverable_name || ""}
                                >
                                  {w.deliverable_name || "—"}
                                </span>
                                <span className="flex items-center gap-1.5 text-[13px] text-[rgb(74,88,120)]">
                                  <Dot color={STAGE_DOT[w.stage] || NEUTRAL_400} size={6} />
                                  {w.stage || "—"}
                                </span>
                                <span className="text-right text-[13px] tabular-nums text-[rgb(74,88,120)]">
                                  {fmtMin(w.time_taken_minutes)}
                                </span>
                                <span>
                                  <Badge color={WORK_STATUS_BADGE[w.status] || "Neutral"}>
                                    {w.status || "Not Started"}
                                  </Badge>
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })}

                  {workGroups.length === 0 && (
                    <div className="px-4 py-10 text-center text-[13px] text-[rgb(84,100,144)]">
                      {workItems.length === 0
                        ? "No work logged yet for this project."
                        : "No entries match this search."}
                    </div>
                  )}

                  {workLogTotal > workItems.length && (
                    <div className="px-4 py-3 text-xs text-[rgb(84,100,144)]">
                      Showing the latest {workItems.length} of {workLogTotal} entries.
                    </div>
                  )}
                </div>
              </div>

              <div className="flex min-w-[240px] flex-[0_1_280px] flex-col gap-3 p-4 shadow-[inset_1px_0_0_rgb(234,238,244)]">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-[rgb(13,27,62)]">
                    Time by member
                  </span>
                  <span className="text-xs text-[rgb(84,100,144)]">
                    {fmtMin(loggedMinutes)} total
                  </span>
                </div>
                {people.map((m) => (
                  <div key={m.name} className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2 text-[13px]">
                      <Avatar name={m.name} size={22} />
                      <span className="min-w-0 flex-1 truncate text-[rgb(74,88,120)]">
                        {m.name}
                      </span>
                      <span className="font-medium tabular-nums text-[rgb(13,27,62)]">
                        {fmtMin(m.minutes)}
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-[rgb(245,246,248)]">
                      <div
                        className="h-full rounded-full bg-[rgb(61,61,204)]"
                        style={{ width: `${m.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {canLogWork && <QuickLogTrigger onOpen={openQuickLog} />}

      <DeliverableModal
        open={delivModal.open}
        mode={delivModal.mode}
        projectId={projectId}
        initial={delivModal.initial}
        currentUserId={currentUserId}
        deliverableTypes={deliverableTypes}
        onClose={() => setDelivModal((m) => ({ ...m, open: false }))}
        onSaved={refreshProject}
      />

      <ImportDeliverablesModal
        open={importOpen}
        projectId={projectId}
        deliverableTypes={deliverableTypes}
        onClose={() => setImportOpen(false)}
        onImported={refreshProject}
      />

      <ProjectEditModal
        open={editProjectOpen}
        onClose={() => setEditProjectOpen(false)}
        onSaved={handleProjectEditSave}
        project={project}
        clients={clients}
      />

      <ConfirmDeleteModal
        open={deleteProjectOpen}
        onClose={() => {
          if (!deletingProject) {
            setDeleteProjectOpen(false);
          }
        }}
        onConfirm={handleProjectDelete}
        title="Delete this project?"
        description={`"${project.name}" will be permanently deleted.`}
        warning="Its deliverables will also be deleted, but all historical work entries will be preserved."
        confirmLabel="Delete Project"
        loading={deletingProject}
      />
    </div>
  );
}
