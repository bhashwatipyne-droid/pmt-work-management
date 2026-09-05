import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  getProjects,
  getProjectMetrics,
  getClients,
  getOptions,
} from "@/services/api";

import { PROJECT_STATUSES } from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";
import { ProjectMetricCard } from "@/components/projects/ProjectMetricCard";
import { KanbanColumn } from "@/components/projects/KanbanColumn";
import { ProjectListTable } from "@/components/projects/ProjectListTable";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const {
    currentUser,
    currentUserId,
    users,
    loading: userLoading,
  } = useUser();

  const [projects, setProjects] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [clients, setClients] = useState([]);
  const [deliverableTypes, setDeliverableTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [view, setView] = useState("chart");
  const [modalOpen, setModalOpen] = useState(false);

  const fetchAll = async () => {
    if (!currentUserId) return;

    setLoading(true);

    try {
      const [p, m, c, opts] = await Promise.all([
        getProjects(currentUserId),
        getProjectMetrics(currentUserId),
        getClients(),
        getOptions(),
      ]);

      setProjects(p);
      setMetrics(m);
      setClients(c);
      setDeliverableTypes(opts.deliverable_types || []);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to load projects"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === "admin") fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, currentUser?.role]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return projects.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;

      if (!q) return true;

      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.client_name || "").toLowerCase().includes(q)
      );
    });
  }, [projects, search, statusFilter]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(
      PROJECT_STATUSES.map((s) => [s, []])
    );

    filtered.forEach((p) => {
      (map[p.status] || map.Active).push(p);
    });

    return map;
  }, [filtered]);

  if (userLoading || !currentUser) return null;

  if (currentUser.role !== "admin") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-medium text-foreground">
          Projects is available to Admins only
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[#2b2bb5] transition-colors hover:bg-[#f0f0fd] hover:text-[#1a1a8a]"
        >
          Go to Work Sheet
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div
      data-testid={PROJECTS.page}
      className="flex-1 overflow-auto bg-[#f7f9fc] px-6 py-6 lg:px-8"
    >
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Projects
            </h1>

            <span className="text-sm font-medium text-muted-foreground">
              {filtered.length}
            </span>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Manage projects, deliverables and production timelines.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <input
              data-testid={PROJECTS.searchInput}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="h-10 w-56 rounded-lg border border-input bg-white pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
            />
          </div>

          <select
            data-testid={PROJECTS.statusFilter}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
          >
            <option value="">All status</option>

            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {/* View toggle */}
          <div className="flex h-10 overflow-hidden rounded-lg border border-border bg-white">
            <button
              type="button"
              data-testid={PROJECTS.chartViewBtn}
              onClick={() => setView("chart")}
              className={[
                "px-3 text-sm font-medium transition-colors",
                view === "chart"
                  ? "bg-[#f0f0fd] text-[#1a1a8a]"
                  : "text-muted-foreground hover:bg-[#fafbff] hover:text-foreground",
              ].join(" ")}
            >
              Chart View
            </button>

            <button
              type="button"
              data-testid={PROJECTS.listViewBtn}
              onClick={() => setView("list")}
              className={[
                "px-3 text-sm font-medium transition-colors",
                view === "list"
                  ? "bg-[#f0f0fd] text-[#1a1a8a]"
                  : "text-muted-foreground hover:bg-[#fafbff] hover:text-foreground",
              ].join(" ")}
            >
              List View
            </button>
          </div>

          <button
            type="button"
            data-testid={PROJECTS.newProjectBtn}
            onClick={() => setModalOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#2b2bb5] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <ProjectMetricCard
          testId={PROJECTS.metricActive}
          label="Active Projects"
          value={metrics?.active_projects ?? 0}
        />

        <ProjectMetricCard
          testId={PROJECTS.metricRework}
          label="In Rework"
          value={metrics?.in_rework ?? 0}
        />

        <ProjectMetricCard
          testId={PROJECTS.metricDueWeek}
          label="Due This Week"
          value={metrics?.due_this_week ?? 0}
        />

        <ProjectMetricCard
          testId={PROJECTS.metricDeliverables}
          label="Deliverables"
          value={metrics?.total_deliverables ?? 0}
        />
      </div>

      {/* Content */}
      {loading ? (
        <div
          data-testid={PROJECTS.loadingState}
          className="rounded-xl border border-border bg-card py-16 text-center text-sm text-muted-foreground"
        >
          Loading projects...
        </div>
      ) : filtered.length === 0 ? (
        <div
          data-testid={PROJECTS.emptyState}
          className="rounded-xl border border-dashed border-border bg-card py-16 text-center"
        >
          <p className="text-sm font-medium text-foreground">
            No projects yet
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Click "New Project" to create your first one.
          </p>
        </div>
      ) : view === "chart" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PROJECT_STATUSES.map((s) => (
            <KanbanColumn
              key={s}
              status={s}
              projects={byStatus[s]}
              users={users}
              onOpenProject={(p) => navigate(`/projects/${p.id}`)}
            />
          ))}
        </div>
      ) : (
        <ProjectListTable
          projects={filtered}
          users={users}
          onOpenProject={(p) => navigate(`/projects/${p.id}`)}
        />
      )}

      <CreateProjectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={fetchAll}
        clients={clients}
        users={users}
        deliverableTypes={deliverableTypes}
      />
    </div>
  );
}