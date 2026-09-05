import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { useUser } from "@/context/UserContext";
import {
  getDashboardOverview,
  getApprovals,
  getProjects,
} from "@/services/api";

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
    ])
      .then(([o, a, p]) => {
        setOverview(o);
        setApprovals(a);
        setProjects(p);
      })
      .finally(() => setLoading(false));
  }, [currentUser?.id, currentUserId]);

  if (userLoading || !currentUser) {
    return null;
  }

  if (currentUser.role !== "admin") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Dashboard is available to Admins only
      </div>
    );
  }

  if (loading || !overview) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
        Loading dashboard...
      </div>
    );
  }

  const recentProjects = projects.slice(0, 5);

  return (
    <div
      data-testid="dashboard-page"
      className="flex-1 overflow-auto bg-[#f7f9fc] px-6 py-6 lg:px-8"
    >
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Dashboard
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          Overview of every project, deliverable and approval across your team.
        </p>
      </div>

      {/* Metric cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <ProjectMetricCard
          testId="dashboard-metric-active-projects"
          label="Active Projects"
          value={overview.active_projects}
        />

        <ProjectMetricCard
          testId="dashboard-metric-needs-review"
          label="Needs Review"
          value={overview.needs_review}
        />

        <ProjectMetricCard
          testId="dashboard-metric-due-week"
          label="Due This Week"
          value={overview.due_this_week}
        />

        <ProjectMetricCard
          testId="dashboard-metric-deliverables"
          label="Total Deliverables"
          value={overview.total_deliverables}
        />
      </div>

      {/* Main dashboard grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Left column */}
        <div className="space-y-5 xl:col-span-2">
          {/* Stage progress */}
          <section className="rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold text-foreground">
                Deliverable Progress by Stage
              </h2>

              <p className="mt-0.5 text-xs text-muted-foreground">
                Current distribution of deliverables across the production workflow.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
              {Object.entries(overview.deliv_stage_counts).map(
                ([stage, count]) => {
                  const c = STAGE_COLORS[stage];

                  return (
                    <div
                      key={stage}
                      className="rounded-lg border border-border bg-white p-4"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${c.dot}`}
                        />

                        <span
                          className={`text-xs font-medium ${c.text}`}
                        >
                          {stage}
                        </span>
                      </div>

                      <div className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                        {count}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </section>

          {/* Recent projects */}
          <section className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  Recent Projects
                </h2>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  Latest projects created across the team.
                </p>
              </div>

              <Link
                to="/projects"
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#2b2bb5] transition-colors hover:bg-[#f0f0fd] hover:text-[#1a1a8a]"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            {recentProjects.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-muted-foreground">
                No projects yet
              </div>
            ) : (
              <div className="divide-y divide-border">
                {recentProjects.map((p) => {
                  const c =
                    STATUS_COLORS[p.status] || STATUS_COLORS.Active;

                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-[#fafbff]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-foreground">
                          {p.name}
                        </div>

                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {p.client_name || "—"} · {p.deliverables_count}{" "}
                          deliverable
                          {p.deliverables_count === 1 ? "" : "s"}
                        </div>
                      </div>

                      <span
                        className={[
                          "shrink-0 rounded-md px-2 py-1",
                          "text-[10px] font-semibold uppercase tracking-wide",
                          c.badge,
                        ].join(" ")}
                      >
                        {p.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Pending approvals */}
        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Pending Approvals
              </h2>

              <p className="mt-0.5 text-xs text-muted-foreground">
                Deliverables waiting for review.
              </p>
            </div>

            <Link
              to="/approvals"
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#2b2bb5] transition-colors hover:bg-[#f0f0fd] hover:text-[#1a1a8a]"
            >
              Review
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {approvals.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <div className="text-sm font-medium text-foreground">
                All caught up
              </div>

              <div className="mt-1 text-xs text-muted-foreground">
                No deliverables are waiting for approval.
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {approvals.slice(0, 6).map((d) => {
                const c =
                  STAGE_COLORS[d.current_stage] ||
                  STAGE_COLORS.Content;

                return (
                  <div
                    key={d.id}
                    className="px-5 py-3.5 transition-colors hover:bg-[#fafbff]"
                  >
                    <div className="truncate text-sm font-medium text-foreground">
                      {d.name}
                    </div>

                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${c.dot}`}
                      />

                      <span className={c.text}>
                        {d.current_stage}
                      </span>

                      <span className="text-slate-300">·</span>

                      <span className="truncate text-muted-foreground">
                        {d.project_name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}