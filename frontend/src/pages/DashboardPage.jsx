import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Megaphone, ClipboardCheck, CalendarClock, Layers3, ArrowRight, AlertTriangle } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getDashboardOverview, getApprovals, getProjects } from "@/services/api";
import { ProjectMetricCard } from "@/components/projects/ProjectMetricCard";
import { STAGE_COLORS, STATUS_COLORS } from "@/constants/projectPalette";

export default function DashboardPage() {
  const { currentUser, currentUserId, loading: userLoading } = useUser();
  const [overview, setOverview] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") return;
    setLoading(true);
    Promise.all([
      getDashboardOverview(currentUserId),
      getApprovals(currentUserId),
      getProjects(currentUserId),
    ]).then(([o, a, p]) => {
      setOverview(o); setApprovals(a); setProjects(p);
    }).finally(() => setLoading(false));
  }, [currentUser?.id, currentUserId]);

  if (userLoading || !currentUser) return null;
  if (currentUser.role !== "admin") {
    return <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-600">Dashboard is available to Admins only</div>;
  }
  if (loading || !overview) {
    return <div className="flex flex-1 items-center justify-center py-16 text-sm text-slate-400">Loading dashboard...</div>;
  }

  const recentProjects = projects.slice(0, 5);

  return (
    <div data-testid="dashboard-page" className="flex-1 overflow-auto px-8 py-6">
      <div className="mb-1 flex items-baseline gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Dashboard</h1>
      </div>
      <p className="mb-6 text-sm text-slate-500">Overview of every project, deliverable and approval across your team.</p>

      {/* Metric cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <ProjectMetricCard testId="dashboard-metric-active-projects" label="Active Projects" value={overview.active_projects} />
        <ProjectMetricCard testId="dashboard-metric-needs-review" label="Needs Review" value={overview.needs_review} />
        <ProjectMetricCard testId="dashboard-metric-due-week" label="Due This Week" value={overview.due_this_week} />
        <ProjectMetricCard testId="dashboard-metric-deliverables" label="Total Deliverables" value={overview.total_deliverables} />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left: Stage progress + Recent Projects */}
        <div className="lg:col-span-2 space-y-5">
          {/* Deliverable stage progress */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <h2 className="mb-4 text-base font-bold text-slate-900">Deliverable Progress by Stage</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Object.entries(overview.deliv_stage_counts).map(([stage, count]) => {
                const c = STAGE_COLORS[stage];
                return (
                  <div key={stage} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                      <span className={`text-xs font-semibold ${c.text}`}>{stage}</span>
                    </div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">{count}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Projects */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Recent Projects</h2>
              <Link to="/projects" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {recentProjects.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">No projects yet</div>
            ) : (
              <div className="space-y-2">
                {recentProjects.map((p) => {
                  const c = STATUS_COLORS[p.status] || STATUS_COLORS.Active;
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{p.name}</div>
                        <div className="text-[11px] text-slate-500">{p.client_name || "—"} · {p.deliverables_count} deliverable{p.deliverables_count === 1 ? "" : "s"}</div>
                      </div>
                      <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${c.badge}`}>{p.status}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Pending approvals */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Pending Approvals</h2>
            <Link to="/approvals" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline">
              Review <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {approvals.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">All caught up</div>
          ) : (
            <div className="space-y-2">
              {approvals.slice(0, 6).map((d) => {
                const c = STAGE_COLORS[d.current_stage] || STAGE_COLORS.Content;
                return (
                  <div key={d.id} className="rounded-lg border border-slate-100 px-3 py-2.5">
                    <div className="truncate text-sm font-semibold text-slate-900">{d.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
                      <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                      <span className={c.text}>{d.current_stage}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500">{d.project_name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
