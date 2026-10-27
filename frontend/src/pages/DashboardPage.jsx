import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSessionState } from "@/hooks/useSessionState";
import { AlertCircle, History, Hourglass, RefreshCw } from "lucide-react";

import { useUser } from "@/context/UserContext";
import { consumePrefetch } from "@/services/prefetch";
import { getDashboardHome, getEfficiencyOverview, getEfficiencyTrend, getTeamActivity } from "@/services/api";
import { TrendsTab } from "@/components/dashboard/TrendsTab";
import { RiskTab } from "@/components/dashboard/RiskTab";
import { ActionsTab } from "@/components/dashboard/ActionsTab";
import { OverviewTab } from "@/components/dashboard/OverviewTab";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { DashboardSkeleton, TeamActivitySkeleton } from "@/components/skeletons/Skeletons";
import TeamActivityTab from "@/components/dashboard/TeamActivityTab";
import { NEXT_STATUSES, TEAM_DEPARTMENT, buildHome, buildTeamActivity, currentMonth, monthLabel, monthShort, pc, shiftMonth } from "@/lib/homeDashboard";
import { C, hrs } from "@/components/dashboard/dashboardTheme";
import { Empty } from "@/components/dashboard/dashboardParts";

// ---------------------------------------------------------------------------
// Design tokens (Mint design system, as in the prototype)

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
  const [tab, setTab] = useSessionState("dashboard-tab", "overview");
  const [cat, setCat] = useSessionState("dashboard-cat", "all");
  const [showAllActions, setShowAllActions] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [filters, setFilters] = useSessionState("dashboard-filters", {});
  const [filtersOpen, setFiltersOpen] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);

    // The first open for this month may already be on its way from boot.
    consumePrefetch(`dashboard-home:${month}`, () => getDashboardHome(month))
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError("Could not load Home. Please refresh the page."))
      .finally(() => !cancelled && setLoading(false));

    // Capacity + productivity come from the Efficiency module; Home still
    // works if they fail.
    consumePrefetch(`dashboard-eff:${month}`, () => getEfficiencyOverview(month))
      .then((d) => !cancelled && setEff(d))
      .catch(() => !cancelled && setEff(null));
    consumePrefetch(`dashboard-trend:${month}`, () => getEfficiencyTrend(month, 6))
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

  const billedViaProject = h.billed.filter((r) => ["Raised Invoice", "Completed"].includes(projects[r.project_id]?.status)).length;
  const kpis = [
    { label: "Active deliverables", value: activeN, den: h.total, denLabel: "total", rows: h.active, dot: C.brand500, go: () => setTab("risk") },
    { label: "On track", value: h.on.length, den: activeN, denLabel: "active", rows: h.on, dot: C.success500, go: () => setTab("risk") },
    {
      label: "Spilled over", value: h.spilled.length, den: h.total, denLabel: "total", rows: h.spilled, dot: C.warning500, go: () => setTab("risk"),
      note: "still open from earlier months",
    },
    {
      label: "Delayed", value: h.delay.length, den: h.total, denLabel: "total", rows: h.delay, dot: C.error500, go: () => setTab("risk"),
      extra: delayDelta == null || delayDelta === 0 ? null : {
        text: `${delayDelta < 0 ? "▼" : "▲"} ${Math.abs(delayDelta)} pts vs ${prevShort}`,
        good: delayDelta < 0,
      },
    },
    { label: "Ready for billing", value: h.ready.length, den: h.total, denLabel: "total", rows: h.ready, dot: C.info500, go: () => navigate("/projects") },
    {
      label: "Billed / completed", value: h.billed.length, den: h.total, denLabel: "total", rows: h.billed, dot: C.n400, go: () => navigate("/projects"),
      note: `${billedViaProject} in invoiced / completed projects · ${h.billed.length - billedViaProject} marked done`,
    },
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
      lead: h.on.length
        ? `${pc(h.on.length, activeN)}% of active work is on track`
        : activeN ? "Nothing open is on track" : "No active work",
      rest: h.on.length
        ? `— ${h.on.length} of ${activeN} deliverables across ${h.projectsOf(h.on)} projects.`
        : activeN ? `— all ${activeN} open deliverables are late or due within 2 days.` : "in this view.",
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

  const ctx = {
    actionsInCat,
    activeN,
    capacity,
    cat,
    cats,
    chips,
    critCount,
    data,
    delayTotal,
    fieldDefs,
    filters,
    filtersOpen,
    glance,
    goProject,
    h,
    kpis,
    label,
    month,
    navigate,
    nextDue,
    openActions,
    prevShort,
    projects,
    quality,
    scopeNote,
    setCat,
    setFilter,
    setFilters,
    setFiltersOpen,
    setMonth,
    setShowAllActions,
    setShowAllProjects,
    setTeam,
    showAllActions,
    showAllProjects,
    shownActions,
    shownProjects,
    team,
    today,
    trend,
    trends,
    userName,
  };

  return (
    <div data-testid="dashboard-page" className="flex-1 overflow-auto bg-white font-['Inter',sans-serif] leading-[normal] text-[rgb(13,27,62)] antialiased">
      <div
        data-screen-label="Home"
        className={`mx-auto flex max-w-[1280px] flex-col gap-5 px-4 pb-24 pt-4 transition-opacity md:gap-6 md:px-6 md:pb-[72px] md:pt-6 ${loading ? "opacity-60" : ""}`}
      >
        <DashboardHeader {...ctx} />

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
        {tab === "team" && !activity && !activityError && <TeamActivitySkeleton />}
        {tab === "team" && !activity && activityError && (
          <Empty>Could not load team activity. Please try again.</Empty>
        )}

        {/* ================= OVERVIEW ================= */}
        {tab === "overview" && (
            <OverviewTab {...ctx} />
        )}

        {/* ================= ACTIONS ================= */}
        {tab === "actions" && (
            <ActionsTab {...ctx} />
        )}

        {/* ================= DELIVERY & RISK ================= */}
        {tab === "risk" && (
            <RiskTab {...ctx} />
        )}

        {/* ================= TRENDS & CAPACITY ================= */}
        {tab === "trends" && (
            <TrendsTab {...ctx} />
        )}
      </div>
    </div>
  );
}