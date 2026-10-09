import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  Filter,
  History,
  Hourglass,
  Palette,
  Play,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";

import { useUser } from "@/context/UserContext";
import { getDashboardHome, getEfficiencyOverview, getEfficiencyTrend, getTeamActivity } from "@/services/api";
import { DashboardSkeleton } from "@/components/skeletons/Skeletons";
import TeamActivityTab from "@/components/dashboard/TeamActivityTab";
import {
  NEXT_STATUSES,
  TEAMS,
  TEAM_DEPARTMENT,
  addDays,
  buildHome,
  buildTeamActivity,
  currentMonth,
  fmtDay,
  fmtWeekday,
  monthLabel,
  monthShort,
  pc,
  shiftMonth,
} from "@/lib/homeDashboard";

// ---------------------------------------------------------------------------
// Design tokens (Mint design system, as in the prototype)

const C = {
  n900: "rgb(13,27,62)",
  n700: "rgb(74,88,120)",
  n500: "rgb(84,100,144)",
  n400: "rgb(138,151,181)",
  n100: "rgb(245,246,248)",
  n50: "rgb(249,250,251)",
  brand500: "rgb(43,43,181)",
  brand700: "rgb(26,26,138)",
  brand100: "rgb(220,220,248)",
  brand50: "rgb(240,240,253)",
  success500: "rgb(16,185,129)",
  success100: "rgb(209,250,229)",
  successText: "rgb(0,91,75)",
  warning500: "rgb(245,158,11)",
  warning100: "rgb(254,243,199)",
  warningText: "rgb(146,64,14)",
  error500: "rgb(239,68,68)",
  error50: "rgb(255,245,245)",
  info500: "rgb(59,130,246)",
  info100: "rgb(219,234,254)",
  infoText: "rgb(30,64,175)",
};

const STAGE_DOT = { Content: C.brand500, Design: C.info500, Animate: C.warning500 };

const BADGE = {
  Neutral: { bg: C.n100, ring: "rgb(239,240,242)", fg: C.n700, dot: C.n400 },
  Info: { bg: C.info100, ring: C.info100, fg: C.infoText, dot: C.info500 },
  Warning: { bg: C.warning100, ring: C.warning100, fg: C.warningText, dot: C.warning500 },
  Success: { bg: C.success100, ring: C.success100, fg: C.successText, dot: C.success500 },
  Error: { bg: C.error50, ring: C.error50, fg: C.error500, dot: C.error500 },
};
const PRI_BADGE = { Critical: "Error", High: "Warning", Medium: "Info", Watch: "Neutral" };
const NEXT_BADGE = { "On track": "Success", "At risk": "Warning", Delayed: "Error", "In review": "Info" };
const LEVEL_BADGE = { High: "Error", Watch: "Warning", Healthy: "Success" };

const HAIRLINE = "shadow-[inset_0_0_0_1px_rgb(234,238,244)]";
const CARD = `rounded-xl bg-white ${HAIRLINE}`;
const EYEBROW =
  "font-['Manrope','Inter',sans-serif] text-[11px] font-bold uppercase leading-4 tracking-[0.06em] text-[rgb(84,100,144)]";
const HEAD_ROW =
  "h-9 items-center bg-[rgb(249,250,251)] px-4 text-[12px] font-semibold text-[rgb(74,88,120)] shadow-[inset_0_1px_0_rgb(234,238,244),inset_0_-1px_0_rgb(226,232,240)]";
const ROW_DIVIDER = "shadow-[inset_0_-1px_0_rgb(243,244,246)]";
const LINK_BTN =
  "flex h-7 items-center gap-1 whitespace-nowrap rounded-[7px] px-2 text-[13px] font-semibold text-[rgb(43,43,181)] hover:bg-[rgb(240,240,253)]";
const BTN_PRIMARY =
  "inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[rgb(43,43,181)] px-3.5 text-[12px] font-semibold leading-4 text-white transition-colors hover:bg-[rgb(61,61,204)]";
const BTN_SECONDARY =
  "inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[rgb(245,246,248)] px-3.5 text-[12px] font-semibold leading-4 text-[rgb(74,88,120)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] transition-colors hover:bg-[rgb(243,244,246)]";

const ACTION_GRID =
  "grid grid-cols-[96px_minmax(280px,2.2fr)_minmax(180px,1fr)_104px_64px_64px] gap-x-4";
const PORT_GRID =
  "grid grid-cols-[minmax(240px,2fr)_64px_64px_64px_64px_72px_104px] gap-x-3";

// ---------------------------------------------------------------------------
// Small pieces

const Dot = ({ color, size = 8, className = "" }) => (
  <span
    className={`shrink-0 rounded-full ${className}`}
    style={{ width: size, height: size, background: color }}
  />
);

const Badge = ({ color = "Neutral", children }) => {
  const c = BADGE[color] || BADGE.Neutral;
  return (
    <span
      className="inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1 font-['Manrope','Inter',sans-serif] text-[10px] leading-4"
      style={{ background: c.bg, color: c.fg, boxShadow: `inset 0 0 0 1px ${c.ring}` }}
    >
      <Dot color={c.dot} size={6} />
      {children}
    </span>
  );
};

const Pill = ({ bg, fg, children }) => (
  <span
    className="self-start whitespace-nowrap rounded-full px-[7px] py-px font-['Manrope','Inter',sans-serif] text-[11px] font-medium leading-4"
    style={{ background: bg, color: fg }}
  >
    {children}
  </span>
);

const Block = ({ title, children }) => (
  <div className="flex min-w-0 flex-col gap-2.5">
    <span className={EYEBROW}>{title}</span>
    {children}
  </div>
);

const SectionHead = ({ title, sub, children }) => (
  <div className="flex flex-wrap items-start gap-3 px-4 pb-3 pt-4">
    <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
      <h2 className="m-0 text-[15px] font-semibold leading-5 text-[rgb(13,27,62)]">{title}</h2>
      <span className="text-[12px] leading-4 text-[rgb(84,100,144)] [text-wrap:pretty]">{sub}</span>
    </div>
    {children}
  </div>
);

const Avatar = ({ name }) => (
  <span className="h-6 w-6 shrink-0 rounded-full bg-[rgb(240,240,253)] text-center font-['Manrope','Inter',sans-serif] text-[10px] font-semibold leading-6 text-[rgb(26,26,138)]">
    {(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
  </span>
);

const StatTile = ({ label, value, sub, color = C.n900, rounded = "rounded-lg", pad = "px-3 py-2.5", subSize = "text-[11px]" }) => (
  <div className={`flex flex-col gap-0.5 bg-[rgb(249,250,251)] ${rounded} ${pad}`}>
    <span className="text-[12px] text-[rgb(84,100,144)]">{label}</span>
    <span className="text-xl font-semibold leading-6 tabular-nums" style={{ color }}>
      {value}
    </span>
    {sub && <span className={`${subSize} text-[rgb(84,100,144)]`}>{sub}</span>}
  </div>
);

const Empty = ({ children }) => (
  <div className="px-4 py-6 text-center text-[13px] text-[rgb(84,100,144)]">{children}</div>
);

const hrs = (n) => `${Math.round(n || 0).toLocaleString("en-IN")}h`;

// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const navigate = useNavigate();
  const { currentUser, users, loading: userLoading } = useUser();

  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState(null);
  const [eff, setEff] = useState(null);
  const [effTrend, setEffTrend] = useState([]);
  // Team activity is loaded the first time its tab is opened (not with Home),
  // and refreshed whenever the tab is opened again.
  const [activity, setActivity] = useState(null);
  const [activityError, setActivityError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [team, setTeam] = useState("All");
  const [tab, setTab] = useState("overview");
  const [cat, setCat] = useState("all");
  const [showAllActions, setShowAllActions] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [filters, setFilters] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);

    getDashboardHome(month)
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError("Could not load Home. Please refresh the page."))
      .finally(() => !cancelled && setLoading(false));

    // Capacity + productivity come from the Efficiency module; Home still
    // works if they fail.
    getEfficiencyOverview(month)
      .then((d) => !cancelled && setEff(d))
      .catch(() => !cancelled && setEff(null));
    getEfficiencyTrend(month, 6)
      .then((d) => !cancelled && setEffTrend(d || []))
      .catch(() => !cancelled && setEffTrend([]));

    return () => {
      cancelled = true;
    };
  }, [month, isAdmin]);

  useEffect(() => {
    if (!isAdmin || tab !== "team") return undefined;
    let cancelled = false;
    setActivityError(false);
    getTeamActivity()
      .then((d) => !cancelled && setActivity(d))
      .catch(() => !cancelled && setActivityError(true));
    return () => {
      cancelled = true;
    };
  }, [isAdmin, tab]);

  const userName = useMemo(
    () => Object.fromEntries((users || []).map((u) => [u.id, u.name])),
    [users]
  );

  const h = useMemo(
    () => (data ? buildHome({ data, team, filters, userName }) : null),
    [data, team, filters, userName]
  );

  const teamAct = useMemo(
    () => (data ? buildTeamActivity({ data, activity: activity || {}, team, filters, userName }) : null),
    [data, activity, team, filters, userName]
  );

  if (userLoading || !currentUser) return null;

  if (!isAdmin) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-[14px] text-muted-foreground">
        Home is available to Admins only
      </div>
    );
  }

  if (!data && loading) return <DashboardSkeleton />;

  if (!data || !h) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center">
        <div>
          <p className="text-[14px] font-medium text-foreground">Home could not be loaded</p>
          <p className="mt-1 text-[12px] text-muted-foreground">{error || "Please refresh the page."}</p>
        </div>
      </div>
    );
  }

  // ---- derived view values ----
  const label = monthLabel(month);
  const prevShort = monthShort(shiftMonth(month, -1));
  const scopeNote = team === "All" ? "All teams" : `${team} team`;
  const activeN = h.active.length;
  const projects = data.projects || {};

  const trend = data.trend || [];
  const cur = trend[trend.length - 1] || {};
  const prev = trend[trend.length - 2] || {};
  const delayDelta =
    cur.delay_rate != null && prev.delay_rate != null ? cur.delay_rate - prev.delay_rate : null;

  const goProject = (id) => navigate(id ? `/projects/${id}` : "/");
  const openActions = (k) => {
    setCat(k);
    setShowAllActions(false);
    setTab("actions");
  };

  const kpis = [
    { label: "Active deliverables", value: activeN, den: h.total, denLabel: "total", rows: h.active, dot: C.brand500, go: () => setTab("risk") },
    { label: "On track", value: h.on.length, den: activeN, denLabel: "active", rows: h.on, dot: C.success500, go: () => setTab("risk") },
    { label: "At risk", value: h.risk.length, den: activeN, denLabel: "active", rows: h.risk, dot: C.warning500, go: () => setTab("risk") },
    {
      label: "Delayed", value: h.delay.length, den: h.total, denLabel: "total", rows: h.delay, dot: C.error500, go: () => setTab("risk"),
      extra: delayDelta == null || delayDelta === 0 ? null : {
        text: `${delayDelta < 0 ? "▼" : "▲"} ${Math.abs(delayDelta)} pts vs ${prevShort}`,
        good: delayDelta < 0,
      },
    },
    { label: "Ready for billing", value: h.ready.length, den: h.total, denLabel: "total", rows: h.ready, dot: C.info500, go: () => navigate("/projects") },
    { label: "Billed / completed", value: h.billed.length, den: h.total, denLabel: "total", rows: h.billed, dot: C.n400, go: () => navigate("/projects") },
  ];

  const cats = [
    { key: "crit", label: "Critical delays", sub: "of delayed deliverables · 3+ days behind", Icon: AlertCircle, bg: C.error50, fg: C.error500 },
    { key: "block", label: "Pending approvals / blockers", sub: "of attention items need follow-up", Icon: Hourglass, bg: C.warning100, fg: C.warningText },
    { key: "review", label: "Reviews waiting >24h", sub: "of work waiting for review", Icon: History, bg: C.warning100, fg: C.warningText },
    { key: "rev", label: "Repeated revisions", sub: "of deliverables in view", Icon: RefreshCw, bg: C.brand50, fg: C.brand700 },
  ].map((c) => ({ ...c, ...h.signals[c.key] }));

  const critCount = h.actions.filter((a) => a.pri === "Critical").length;
  const topDelay = [...h.delayTeams].sort((a, b) => b.count - a.count)[0];
  const nextDue = h.next.length;
  const glance = [
    {
      dot: C.success500,
      lead: `${pc(h.on.length, activeN)}% of active work is on track`,
      rest: `— ${h.on.length} of ${activeN} deliverables across ${h.projectsOf(h.on)} projects.`,
    },
    h.delay.length
      ? {
          dot: C.error500,
          lead: `${h.delay.length} deliverable${h.delay.length === 1 ? " is" : "s are"} delayed`,
          rest: topDelay && topDelay.count ? `— mostly ${topDelay.team} (${topDelay.share}%).` : ".",
        }
      : { dot: C.success500, lead: "Nothing is delayed", rest: "in this view." },
    {
      dot: C.warning500,
      lead: `${nextDue} item${nextDue === 1 ? " is" : "s are"} due in the next 7 days`,
      rest: `— ${h.nextCount("At risk")} at risk and ${h.nextCount("Delayed")} already late.`,
    },
  ];

  const actionsInCat = h.actions.filter((a) => cat === "all" || a.cat === cat);
  const shownActions = showAllActions ? actionsInCat : actionsInCat.slice(0, 6);
  const shownProjects = showAllProjects ? h.portfolio : h.portfolio.slice(0, 10);
  const delayTotal = h.delayAll.length;

  // ---- filters ----
  const clientOpts = [...new Map(Object.values(projects).filter((p) => p.client_id).map((p) => [p.client_id, p.client_name])).entries()]
    .sort((a, b) => (a[1] || "").localeCompare(b[1] || ""));
  const projectOpts = Object.values(projects)
    .filter((p) => !filters.client || p.client_id === filters.client)
    .map((p) => [p.id, p.name])
    .sort((a, b) => a[1].localeCompare(b[1]));
  const memberOpts = [...new Set((data.deliverables || []).map((r) => r.owner_id).filter(Boolean))]
    .map((id) => [id, userName[id] || "Unknown"])
    .sort((a, b) => a[1].localeCompare(b[1]));
  const fieldDefs = [
    { key: "client", label: "Client", all: "All clients", opts: clientOpts },
    { key: "project", label: "Project", all: "All projects", opts: projectOpts },
    { key: "member", label: "Member", all: "All members", opts: memberOpts },
    { key: "status", label: "Status", all: "All statuses", opts: NEXT_STATUSES.map((s) => [s, s]) },
  ];
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v || undefined }));
  const chips = fieldDefs
    .filter((f) => filters[f.key])
    .map((f) => ({
      key: f.key,
      label: `${f.label}: ${f.opts.find(([v]) => v === filters[f.key])?.[1] || filters[f.key]}`,
    }));

  // ---- capacity (Efficiency module, sliced to the team) ----
  const dept = team === "All" ? null : TEAM_DEPARTMENT[team];
  const effRows = (eff?.employees || []).filter((e) => !dept || e.department === dept);
  const coreH = effRows.filter((e) => e.has_capacity).reduce((s, e) => s + (e.core_hours || 0), 0);
  const nonCoreH = effRows.reduce((s, e) => s + (e.non_core_hours || 0), 0);
  const tracked = effRows.filter((e) => e.has_capacity).length;
  const capacity = eff
    ? [
        { label: "Core hours", value: hrs(coreH), sub: "Client and project work" },
        { label: "Non-core hours", value: hrs(nonCoreH), sub: "Admin, meetings, internal" },
        { label: "Core share", value: `${pc(coreH, coreH + nonCoreH)}%`, sub: "Of tracked hours" },
        { label: "Employees tracked", value: String(tracked), sub: "Capacity configured in view" },
      ]
    : null;

  const members = (data.members?.tracked || []).filter((m) => !dept || m.department === dept);
  const stale = (data.members?.stale || []).filter((m) => !dept || m.department === dept);
  const quality = [
    { label: "Changes requested", value: `${h.quality.changes.value} / ${h.quality.changes.den}`, sub: `${pc(h.quality.changes.value, h.quality.changes.den)}% of deliverables in view` },
    { label: "Rework-caused delays", value: `${h.quality.reworkDelays.value} / ${h.quality.reworkDelays.den}`, sub: `${pc(h.quality.reworkDelays.value, h.quality.reworkDelays.den)}% of delayed deliverables` },
    { label: "Stale members", value: `${stale.length} / ${members.length}`, sub: `${pc(stale.length, members.length)}% of tracked members` },
    { label: "Avg. revisions", value: h.quality.avgRevisions.toFixed(1), sub: "Per deliverable in view" },
  ];

  const prodByMonth = Object.fromEntries(effTrend.map((t) => [t.month, t.team_productivity]));
  const trends = [
    { label: "Delay rate", unit: "%", good: "down", vals: trend.map((t) => t.delay_rate) },
    { label: "Team productivity", unit: "%", good: "up", vals: trend.map((t) => (prodByMonth[t.month] != null ? Math.round(prodByMonth[t.month]) : null)) },
    { label: "First-pass approval", unit: "%", good: "up", vals: trend.map((t) => t.first_pass) },
    { label: "PMT discipline", unit: "%", good: "up", vals: trend.map((t) => t.discipline) },
  ];

  const tabs = [
    { key: "overview", label: "Overview" },
    {
      key: "team",
      label: "Team activity",
      badge: teamAct
        ? teamAct.everyone.filter((p) => p.delays > 0 || p.state === "blocked").length
        : 0,
      badgeBg: C.error50,
      badgeFg: C.error500,
    },
    { key: "actions", label: "Actions", badge: h.actions.length, badgeBg: C.brand500, badgeFg: "#fff" },
    { key: "risk", label: "Delivery & risk", badge: h.delay.length, badgeBg: C.error50, badgeFg: C.error500 },
    { key: "trends", label: "Trends & capacity" },
  ];

  const today = data.today;

  return (
    <div data-testid="dashboard-page" className="flex-1 overflow-auto bg-white font-['Inter',sans-serif] leading-[normal] text-[rgb(13,27,62)] antialiased">
      <div
        data-screen-label="Home"
        className={`mx-auto flex max-w-[1280px] flex-col gap-5 px-4 pb-24 pt-4 transition-opacity md:gap-6 md:px-6 md:pb-[72px] md:pt-6 ${loading ? "opacity-60" : ""}`}
      >
        {/* ---------------- Header ---------------- */}
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="flex min-w-[240px] flex-1 flex-col gap-1">
              <h1 className="m-0 text-[28px] font-bold leading-9 text-[rgb(13,27,62)]">Home</h1>
              <p className="m-0 text-[14px] text-[rgb(84,100,144)] [text-wrap:pretty]">
                {label} · {scopeNote} · {h.total} deliverables · {h.projectCount} projects · {activeN} active
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Month */}
              <div className="flex items-center rounded-[7px] bg-white shadow-[inset_0_0_0_1px_rgb(239,240,242)]">
                <button type="button" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))} className="flex h-8 w-8 items-center justify-center text-[rgb(74,88,120)]">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[112px] text-center text-[13px] font-medium">{label}</span>
                <button type="button" aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))} className="flex h-8 w-8 items-center justify-center text-[rgb(74,88,120)]">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Filters */}
              <span className="relative flex">
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={filtersOpen}
                  onClick={() => setFiltersOpen((o) => !o)}
                  className="flex h-8 items-center gap-1.5 rounded-[7px] bg-white px-2.5 text-[13px] font-medium text-[rgb(74,88,120)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] hover:bg-[rgb(249,250,251)]"
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filters
                  {chips.length > 0 && (
                    <span className="box-border h-[18px] min-w-[18px] rounded-full bg-[rgb(43,43,181)] px-[5px] text-center font-['Manrope','Inter',sans-serif] text-[11px] font-semibold leading-[18px] text-white">
                      {chips.length}
                    </span>
                  )}
                </button>
                {filtersOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setFiltersOpen(false)} />
                    <div role="dialog" aria-label="Filters" className="absolute right-0 top-[calc(100%+6px)] z-[41] flex w-[300px] flex-col gap-3 rounded-xl bg-white p-3.5 shadow-[0_0_0_1px_rgb(234,238,244),0_6px_25px_rgba(13,28,61,0.12)]">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[14px] font-semibold text-[rgb(13,27,62)]">Filters</span>
                        <span className="text-[12px] text-[rgb(84,100,144)]">Applies to every section on Home</span>
                      </div>
                      {fieldDefs.map((f) => (
                        <label key={f.key} className="flex flex-col gap-1 text-[12px] font-medium text-[rgb(74,88,120)]">
                          {f.label}
                          <select
                            value={filters[f.key] || ""}
                            onChange={(e) => setFilter(f.key, e.target.value)}
                            className="h-[34px] rounded-[7px] border-none bg-white px-2 text-[13px] font-normal text-[rgb(13,27,62)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] outline-none"
                          >
                            <option value="">{f.all}</option>
                            {f.opts.map(([v, t]) => (
                              <option key={v} value={v}>{t}</option>
                            ))}
                          </select>
                        </label>
                      ))}
                      <div className="flex justify-between gap-2 pt-1">
                        <button type="button" className={BTN_SECONDARY} onClick={() => setFilters({})}>Reset</button>
                        <button type="button" className={BTN_PRIMARY} onClick={() => setFiltersOpen(false)}>Done</button>
                      </div>
                    </div>
                  </>
                )}
              </span>

              <button type="button" className={BTN_PRIMARY} onClick={() => navigate("/projects", { state: { openCreate: true } })}>
                <Plus className="h-3.5 w-3.5" />
                New project
              </button>
            </div>
          </div>

          {/* Team view */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className={EYEBROW}>Team view</span>
            <div role="radiogroup" aria-label="Team view" className="flex rounded-lg bg-[rgb(245,246,248)] p-0.5">
              {["All", ...TEAMS].map((t) => {
                const on = team === t;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setTeam(t);
                      setCat("all");
                    }}
                    className={`h-7 rounded-[7px] px-3 text-[12px] font-semibold ${
                      on ? "bg-white text-[rgb(13,27,62)] shadow-[0_1px_2px_0_rgba(13,28,61,0.05)]" : "text-[rgb(84,100,144)]"
                    }`}
                  >
                    {t === "All" ? "All teams" : t}
                  </button>
                );
              })}
            </div>
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label="Remove filter"
                  onClick={() => setFilter(c.key, "")}
                  className="flex h-7 items-center gap-1.5 rounded-full bg-[rgb(240,240,253)] pl-2.5 pr-2 text-[12px] font-semibold text-[rgb(26,26,138)] shadow-[inset_0_0_0_1px_rgb(144,144,236)]"
                >
                  {c.label}
                  <X className="h-2.5 w-2.5" />
                </button>
              ))}
              <button type="button" onClick={() => setFilters({})} className="h-7 rounded-[7px] px-2 text-[12px] font-semibold text-[rgb(84,100,144)] hover:text-[rgb(13,27,62)]">
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* ---------------- Tabs ---------------- */}
        <div className="sticky top-0 z-[6] -mx-4 -mb-2 -mt-3 flex items-center gap-2 bg-white px-4 md:-mx-6 md:px-6 shadow-[inset_0_-1px_0_rgb(234,238,244)]">
          <div role="tablist" aria-label="Home sections" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
            {tabs.map((t) => {
              const on = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setTab(t.key)}
                  className={`flex h-11 shrink-0 items-center gap-2 whitespace-nowrap px-2.5 text-[14px] font-semibold hover:text-[rgb(13,27,62)] ${
                    on ? "text-[rgb(13,27,62)] shadow-[inset_0_-2px_0_rgb(43,43,181)]" : "text-[rgb(84,100,144)]"
                  }`}
                >
                  {t.label}
                  {t.badge > 0 && (
                    <span
                      className="box-border h-5 min-w-5 rounded-full px-1.5 text-center font-['Manrope','Inter',sans-serif] text-[11px] font-semibold leading-5"
                      style={{ background: t.badgeBg, color: t.badgeFg }}
                    >
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <span className="shrink-0 text-[12px] text-[rgb(84,100,144)]">{h.total} deliverables in view</span>
        </div>

        {/* ================= TEAM ACTIVITY ================= */}
        {tab === "team" && teamAct && activity && (
          <TeamActivityTab
            activity={teamAct}
            onOpenSheet={(name) => navigate("/", { state: { search: name } })}
          />
        )}
        {tab === "team" && !activity && (
          <Empty>{activityError ? "Could not load team activity. Please try again." : "Loading team activity…"}</Empty>
        )}

        {/* ================= OVERVIEW ================= */}
        {tab === "overview" && (
          <>
            <section aria-label="This month at a glance" className={`${CARD} flex flex-wrap items-center gap-x-8 gap-y-4 p-5`}>
              <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-3">
                <span className={EYEBROW}>At a glance · {label}</span>
                {glance.map((g) => (
                  <div key={g.lead} className="flex items-start gap-2.5 text-[15px] leading-[22px] text-[rgb(74,88,120)]">
                    <Dot color={g.dot} className="mt-[7px]" />
                    <span className="[text-wrap:pretty]">
                      <strong className="font-semibold text-[rgb(13,27,62)]">{g.lead}</strong> {g.rest}
                    </span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => openActions(critCount ? "crit" : "all")}
                className="inline-flex h-[34px] items-center gap-1.5 rounded-[7px] bg-[rgb(43,43,181)] px-4 text-[13px] font-semibold leading-[18px] text-white transition-colors hover:bg-[rgb(61,61,204)]"
              >
                {critCount ? `Review ${critCount} critical action${critCount === 1 ? "" : "s"}` : "Review actions"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </section>

            <Block title="Where are we?">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
                {kpis.map((k) => (
                  <button
                    key={k.label}
                    type="button"
                    onClick={k.go}
                    className={`${CARD} flex min-w-0 flex-col gap-2 p-4 text-left transition-shadow duration-100 hover:shadow-[inset_0_0_0_1px_rgb(144,144,236)]`}
                  >
                    <span className="flex items-center gap-2 text-[13px] font-medium text-[rgb(74,88,120)]">
                      <Dot color={k.dot} />
                      {k.label}
                    </span>
                    <span className="flex items-baseline gap-1.5">
                      <span className="text-[32px] font-bold leading-10 text-[rgb(13,27,62)]">{k.value}</span>
                      <span className="text-[14px] text-[rgb(138,151,181)]">/ {k.den}</span>
                    </span>
                    <span className="h-1 overflow-hidden rounded-full bg-[rgb(245,246,248)]">
                      <span className="block h-full rounded-full" style={{ width: `${pc(k.value, k.den)}%`, background: k.dot }} />
                    </span>
                    <span className="text-[12px] leading-4 text-[rgb(84,100,144)]">
                      {pc(k.value, k.den)}% of {k.denLabel} · {h.projectsOf(k.rows)} projects
                    </span>
                    {k.extra && (
                      <Pill bg={k.extra.good ? C.success100 : C.error50} fg={k.extra.good ? C.successText : C.error500}>
                        {k.extra.text}
                      </Pill>
                    )}
                  </button>
                ))}
              </div>
            </Block>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] items-start gap-4">
              <Block title="What needs attention now?">
                <section className={`${CARD} flex flex-col overflow-hidden`}>
                  {cats.map(({ key, label: l, sub, Icon, bg, fg, value, den }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => openActions(key)}
                      className={`flex items-center gap-3.5 bg-white px-4 py-3.5 text-left ${ROW_DIVIDER} hover:bg-[rgb(249,250,251)]`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: bg, color: fg }}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[14px] font-medium text-[rgb(13,27,62)]">{l}</span>
                        <span className="text-[12px] leading-4 text-[rgb(84,100,144)] [text-wrap:pretty]">{pc(value, den)}% {sub}</span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-[3px]">
                        <span className="text-xl font-semibold leading-6 text-[rgb(13,27,62)]">{value}</span>
                        <span className="text-[12px] text-[rgb(138,151,181)]">/ {den}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-[rgb(138,151,181)]" />
                    </button>
                  ))}
                </section>
              </Block>

              <Block title="What is coming next?">
                <section className={`${CARD} flex min-w-0 flex-col`}>
                  <SectionHead
                    title="Next 7 days"
                    sub={`Work due ${fmtDay(today)} – ${fmtDay(addDays(today, 7))}. Click an item to open its project.`}
                  />
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2 px-4 pb-3">
                    <StatTile label="Due" value={nextDue} />
                    <StatTile label="At risk" value={`${h.nextCount("At risk")} / ${nextDue}`} sub={`${pc(h.nextCount("At risk"), nextDue)}% of due`} color={C.warningText} />
                    <StatTile label="In review" value={`${h.nextCount("In review")} / ${nextDue}`} sub={`${pc(h.nextCount("In review"), nextDue)}% of due`} color={C.infoText} />
                    <StatTile label="Already delayed" value={`${h.nextCount("Delayed")} / ${nextDue}`} sub={`${pc(h.nextCount("Delayed"), nextDue)}% of due`} color={C.error500} />
                  </div>
                  {nextDue > 0 && (
                    <div className="mx-4 mb-3 rounded-lg bg-[rgb(209,250,229)] px-3 py-2 text-[12px] leading-4 text-[rgb(0,91,75)]">
                      {nextDue - h.nextCount("Delayed")} items should close or move forward if current blockers are resolved.
                    </div>
                  )}
                  {h.next.slice(0, 7).map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => goProject(n.project_id)}
                      className="flex items-center gap-3 bg-white px-4 py-2.5 text-left shadow-[inset_0_1px_0_rgb(243,244,246)] hover:bg-[rgb(249,250,251)]"
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                        <span className="truncate text-[14px] font-medium text-[rgb(13,27,62)]">{n.name}</span>
                        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-[rgb(84,100,144)]">
                          <Dot color={STAGE_DOT[n.stage]} size={6} />
                          <span className="truncate" title={projects[n.project_id]?.name}>
                            {projects[n.project_id]?.name} · {n.stage} · {n.owner_id ? userName[n.owner_id] || "Unknown" : "Unassigned"}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[12px] font-medium text-[rgb(74,88,120)]">{fmtWeekday(n.final_due)}</span>
                        <Badge color={NEXT_BADGE[n.next_status]}>{n.next_status}</Badge>
                      </span>
                    </button>
                  ))}
                  {nextDue === 0 && <Empty>Nothing due in the next 7 days for this view.</Empty>}
                </section>
              </Block>
            </div>
          </>
        )}

        {/* ================= ACTIONS ================= */}
        {tab === "actions" && (
          <Block title="What should management act on?">
            <section className={`${CARD} flex flex-col`}>
              <SectionHead title="Priority action queue" sub="Issue → evidence → owner → resolve-by → age." />
              <div role="radiogroup" aria-label="Filter actions" className="flex flex-wrap gap-2 px-4 pb-3">
                {[{ key: "all", label: "All" }, ...cats].map((c) => {
                  const on = cat === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setCat(on && c.key !== "all" ? "all" : c.key);
                        setShowAllActions(false);
                      }}
                      className="flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold"
                      style={{
                        background: on ? C.brand50 : "#fff",
                        color: on ? C.brand700 : C.n700,
                        boxShadow: `inset 0 0 0 1px ${on ? C.brand500 : "rgb(239,240,242)"}`,
                      }}
                    >
                      {c.label}
                      {c.key !== "all" && <span className="font-medium text-[rgb(84,100,144)]">{c.value}</span>}
                    </button>
                  );
                })}
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[880px]">
                  <div className={`${ACTION_GRID} ${HEAD_ROW}`}>
                    <span>Priority</span><span>Action / evidence</span><span>Owner / approver</span><span>Resolve by</span><span>Age</span><span />
                  </div>
                  {shownActions.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => goProject(a.row.project_id)}
                      className={`${ACTION_GRID} min-h-[60px] w-full items-center bg-white px-4 py-2.5 text-left ${ROW_DIVIDER} hover:bg-[rgb(249,250,251)]`}
                    >
                      <span><Badge color={PRI_BADGE[a.pri]}>{a.pri}</Badge></span>
                      <span className="flex min-w-0 flex-col gap-[3px]">
                        <span className="truncate text-[14px] font-medium text-[rgb(13,27,62)]" title={a.title}>{a.title}</span>
                        <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-[rgb(84,100,144)]">
                          <Dot color={STAGE_DOT[a.team]} size={6} />
                          <span className="truncate" title={a.evidence}>{a.evidence}</span>
                        </span>
                      </span>
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar name={a.owner} />
                        <span className="flex min-w-0 flex-col gap-px">
                          <span className="truncate text-[13px] font-medium text-[rgb(13,27,62)]">{a.owner}</span>
                          <span className="text-[11px] text-[rgb(138,151,181)]">Owner</span>
                          {a.approver && (
                            <span className="truncate text-[11px] text-[rgb(84,100,144)]" title={a.approver}>
                              Approver · <span className="font-medium text-[rgb(13,27,62)]">{a.approver}</span>
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="text-[13px] font-medium text-[rgb(13,27,62)]">{a.by}</span>
                      <span className="text-[13px] text-[rgb(84,100,144)]">{a.age}</span>
                      <span className="flex items-center justify-end gap-0.5 text-[13px] font-semibold text-[rgb(43,43,181)]">
                        Open
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </button>
                  ))}
                  {actionsInCat.length > 6 && (
                    <button
                      type="button"
                      onClick={() => setShowAllActions((s) => !s)}
                      className="h-10 w-full bg-white text-[13px] font-semibold text-[rgb(43,43,181)] hover:bg-[rgb(240,240,253)]"
                    >
                      {showAllActions ? "Show fewer" : `Show all ${actionsInCat.length} actions`}
                    </button>
                  )}
                  {actionsInCat.length === 0 && <Empty>No actions for this signal in the current view.</Empty>}
                </div>
              </div>
              <div className="px-4 py-2.5 text-[12px] leading-4 text-[rgb(84,100,144)] shadow-[inset_0_1px_0_rgb(234,238,244)]">
                Owner is whoever last logged work on the deliverable at its current stage (for review items, the member who marked it ready). Approver is who has to sign off; resolve-by follows the signal&apos;s urgency.
              </div>
            </section>
          </Block>
        )}

        {/* ================= DELIVERY & RISK ================= */}
        {tab === "risk" && (
          <>
            <Block title="What is driving the problem?">
              <section className={`${CARD} flex flex-col`}>
                <SectionHead
                  title="Delay attribution by team"
                  sub={`Each delayed deliverable counts once against the team where it is stuck. Out of ${delayTotal} delayed this month.`}
                />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 px-4 pb-4">
                  {h.delayTeams.map((d) => {
                    const on = team === d.team;
                    const icon = {
                      Content: [FileText, C.info100, C.infoText],
                      Design: [Palette, C.brand50, C.brand700],
                      Animate: [Play, C.success100, C.successText],
                    }[d.team];
                    const [Icon, ibg, ifg] = icon;
                    const facts = [
                      ["Person", d.person],
                      ["Client", d.client],
                      ["Project", d.project],
                    ];
                    return (
                      <button
                        key={d.team}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setTeam(on ? "All" : d.team);
                          setCat("all");
                        }}
                        className="flex min-w-0 flex-col gap-3 rounded-[10px] p-4 text-left transition-[box-shadow,background] duration-100 hover:shadow-[inset_0_0_0_1px_rgb(144,144,236)]"
                        style={{
                          background: on ? C.brand50 : "#fff",
                          boxShadow: on ? `inset 0 0 0 2px ${C.brand500}` : "inset 0 0 0 1px rgb(234,238,244)",
                        }}
                      >
                        <span className="flex items-start gap-3">
                          <span className="flex flex-1 flex-col gap-1">
                            <span className="text-[14px] font-semibold text-[rgb(13,27,62)]">{d.team}</span>
                            <span className="flex items-baseline gap-1">
                              <span className="text-[28px] font-bold leading-9 text-[rgb(13,27,62)]">{d.count}</span>
                              <span className="text-[14px] text-[rgb(138,151,181)]">/ {delayTotal}</span>
                            </span>
                            <span className="text-[12px] text-[rgb(84,100,144)]">{d.share}% of delayed deliverables</span>
                          </span>
                          <span className="flex h-9 w-9 items-center justify-center rounded-[10px]" style={{ background: ibg, color: ifg }}>
                            <Icon className="h-4 w-4" />
                          </span>
                        </span>
                        <span className="h-1.5 overflow-hidden rounded-full bg-[rgb(245,246,248)]">
                          <span className="block h-full rounded-full" style={{ width: `${d.share}%`, background: STAGE_DOT[d.team] }} />
                        </span>
                        <span className="grid grid-cols-[80px_minmax(0,1fr)] gap-x-3 gap-y-2 pt-3 text-[13px] shadow-[inset_0_1px_0_rgb(243,244,246)]">
                          {facts.map(([k, v]) => (
                            <Fragment key={k}>
                              <span className="text-[12px] text-[rgb(84,100,144)]">{k}</span>
                              <span className="truncate font-medium text-[rgb(13,27,62)]" title={v?.name}>
                                {v ? v.name : "—"}
                                {v && <span className="font-normal text-[rgb(138,151,181)]"> · {v.n}</span>}
                              </span>
                            </Fragment>
                          ))}
                        </span>
                        <span className="flex items-center gap-1 pt-2.5 text-[12px] font-semibold shadow-[inset_0_1px_0_rgb(243,244,246)]" style={{ color: on ? C.brand700 : C.brand500 }}>
                          {on ? "Current team view · show all teams" : `View ${d.team} dashboard`}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            </Block>

            <Block title="Where is risk concentrated?">
              <section className={`${CARD} flex min-w-0 flex-col`}>
                <SectionHead title="Portfolio health" sub="Compare projects at a glance. Click one to open it.">
                  <button type="button" onClick={() => navigate("/projects")} className={LINK_BTN}>
                    All projects
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </SectionHead>
                <div className="overflow-x-auto">
                  <div className="min-w-[620px]">
                    <div className={`${PORT_GRID} ${HEAD_ROW}`}>
                      <span>Client / project</span>
                      <span className="text-right">Active</span>
                      <span className="text-right">At risk</span>
                      <span className="text-right">Delayed</span>
                      <span className="text-right">Review</span>
                      <span className="text-right">On time</span>
                      <span>Attention</span>
                    </div>
                    {shownProjects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => goProject(p.id)}
                        className={`${PORT_GRID} min-h-[52px] w-full items-center bg-white px-4 py-1.5 text-left text-[14px] tabular-nums ${ROW_DIVIDER} hover:bg-[rgb(249,250,251)]`}
                      >
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-medium text-[rgb(13,27,62)]" title={p.name}>{p.name}</span>
                          <span className="truncate text-[12px] text-[rgb(84,100,144)]">{p.client}</span>
                        </span>
                        <span className="text-right text-[rgb(74,88,120)]">{p.active}</span>
                        <span className="text-right font-medium" style={{ color: p.risk ? C.warningText : C.n400 }}>{p.risk}</span>
                        <span className="text-right font-medium" style={{ color: p.delay ? C.error500 : C.n400 }}>{p.delay}</span>
                        <span className="text-right text-[rgb(74,88,120)]">{p.review}</span>
                        <span
                          className="text-right font-semibold"
                          style={{ color: p.onTime >= 85 ? C.successText : p.onTime >= 70 ? C.warningText : C.error500 }}
                        >
                          {p.onTime}%
                        </span>
                        <span><Badge color={LEVEL_BADGE[p.level]}>{p.level}</Badge></span>
                      </button>
                    ))}
                    {h.portfolio.length > 10 && (
                      <button
                        type="button"
                        onClick={() => setShowAllProjects((s) => !s)}
                        className="h-10 w-full bg-white text-[13px] font-semibold text-[rgb(43,43,181)] hover:bg-[rgb(240,240,253)]"
                      >
                        {showAllProjects ? "Show fewer" : `Show all ${h.portfolio.length} projects`}
                      </button>
                    )}
                    {h.portfolio.length === 0 && <Empty>No projects match the current filters.</Empty>}
                  </div>
                </div>
              </section>
            </Block>
          </>
        )}

        {/* ================= TRENDS & CAPACITY ================= */}
        {tab === "trends" && (
          <>
            <Block title="Are we improving or getting worse?">
              <section className={`${CARD} flex flex-col`}>
                <SectionHead title="Six-month management trend" sub="Direction matters more than a single month. Current month in solid blue." />
                <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 px-4 pb-4">
                  {trends.map((t) => {
                    const vals = t.vals;
                    const now = vals[vals.length - 1];
                    const before = vals[vals.length - 2];
                    const delta = now != null && before != null ? now - before : null;
                    const better = delta == null ? true : t.good === "up" ? delta >= 0 : delta <= 0;
                    const max = Math.max(1, ...vals.filter((v) => v != null));
                    return (
                      <div key={t.label} className={`flex flex-col gap-2.5 rounded-[10px] p-3.5 ${HAIRLINE}`}>
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-[13px] font-medium text-[rgb(74,88,120)]">{t.label}</span>
                          <span className="text-[11px] text-[rgb(138,151,181)]">{t.good === "up" ? "Higher is better" : "Lower is better"}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-2xl font-semibold leading-8 text-[rgb(13,27,62)]">{now != null ? `${now}${t.unit}` : "—"}</span>
                          {delta != null && (
                            <Pill bg={better ? C.success100 : C.error50} fg={better ? C.successText : C.error500}>
                              {delta > 0 ? "+" : ""}{delta} pts vs {prevShort}
                            </Pill>
                          )}
                        </span>
                        <div className="flex h-14 items-end gap-1.5">
                          {vals.map((v, i) => (
                            <span key={trend[i]?.month || i} title={`${monthShort(trend[i].month)} · ${v != null ? `${v}${t.unit}` : "no data"}`} className="flex h-full flex-1 items-end">
                              <span
                                className="w-full rounded-[4px_4px_2px_2px]"
                                style={{
                                  height: v != null ? `${Math.round((v / max) * 100)}%` : 0,
                                  background: i === vals.length - 1 ? C.brand500 : C.brand100,
                                }}
                              />
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-1.5">
                          {trend.map((m) => (
                            <span key={m.month} className="flex-1 text-center text-[11px] text-[rgb(138,151,181)]">{monthShort(m.month)}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </Block>

            <Block title="What does the operational context say?">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,420px),1fr))] items-start gap-4">
                <section className={`${CARD} flex flex-col`}>
                  <SectionHead title="Capacity context" sub="Current operating capacity for this view.">
                    <button type="button" onClick={() => navigate("/efficiency")} className={LINK_BTN}>
                      Team &amp; productivity
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </SectionHead>
                  {capacity ? (
                    <div className="grid grid-cols-2 gap-2.5 px-4 pb-4">
                      {capacity.map((m) => (
                        <StatTile key={m.label} {...m} rounded="rounded-[10px]" pad="px-3.5 py-3" subSize="text-[12px]" />
                      ))}
                    </div>
                  ) : (
                    <Empty>Capacity isn&apos;t available for this month.</Empty>
                  )}
                </section>
                <section className={`${CARD} flex flex-col`}>
                  <SectionHead title="Quality & data trust" sub="Exception signals not already shown in the trend.">
                    <div className="flex flex-wrap gap-0.5">
                      <button type="button" onClick={() => openActions("rev")} className={LINK_BTN}>
                        Quality &amp; rework
                        <ArrowRight className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => navigate("/efficiency")} className={LINK_BTN}>
                        PMT usage
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  </SectionHead>
                  <div className="grid grid-cols-2 gap-2.5 px-4 pb-4">
                    {quality.map((m) => (
                      <StatTile key={m.label} {...m} rounded="rounded-[10px]" pad="px-3.5 py-3" subSize="text-[12px]" />
                    ))}
                  </div>
                </section>
              </div>
            </Block>
          </>
        )}
      </div>
    </div>
  );
}