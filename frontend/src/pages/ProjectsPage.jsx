import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  Search,
  Plus,
  ArrowRight,
  Eye,
  LayoutGrid,
  List,
  X,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  getProjects,
  getProjectMetrics,
  getClients,
  getOptions,
  hideProject,
  unhideProject,
  deleteProject,
  bulkHideProjects,
  bulkUnhideProjects,
  bulkUpdateProjectStatus,
  bulkDeleteProjects,
} from "@/services/api";

import { PROJECT_STATUSES } from "@/constants/projectPalette";
import { PROJECTS } from "@/constants/testIds";
import { ProjectMetricCard } from "@/components/projects/ProjectMetricCard";
import { KanbanColumn } from "@/components/projects/KanbanColumn";
import { KanbanBoard } from "@/components/ui/KanbanBoard";
import { ProjectListTable } from "@/components/projects/ProjectListTable";
import { ProjectBulkActionBar } from "@/components/projects/ProjectBulkActionBar";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  const [pocFilter, setPocFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visibility, setVisibility] = useState("visible");
  const [view, setView] = useState("chart");
  const [modalOpen, setModalOpen] = useState(false);

  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [hiddenColumns, setHiddenColumns] = useState(() => {
    try {
      return new Set(
        JSON.parse(
          localStorage.getItem("pmt-hidden-project-columns") || "[]"
        )
      );
    } catch {
      return new Set();
    }
  });

  const [listPage, setListPage] = useState(1);

  const fetchAll = async () => {
    if (!currentUserId) return;

    setLoading(true);

    try {
      const [p, m, c, opts] = await Promise.all([
        getProjects(currentUserId, { visibility }),
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
  }, [currentUserId, currentUser?.role, visibility]);

  const pocOptions = useMemo(() => {
    return [
      ...new Set(
        projects.map((p) => p.client_poc).filter(Boolean)
      ),
    ].sort();
  }, [projects]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return projects
      .filter((p) => {
        if (statusFilter && p.status !== statusFilter) return false;

        if (
          pocFilter &&
          (p.client_poc || "").toLowerCase() !== pocFilter.toLowerCase()
        ) {
          return false;
        }

        // Filter by project due date
        if (dateFrom && (!p.end_date || p.end_date < dateFrom)) return false;
        if (dateTo && (!p.end_date || p.end_date > dateTo)) return false;

        if (!q) return true;

        return (
          (p.name || "").toLowerCase().includes(q) ||
          (p.code || "").toLowerCase().includes(q) ||
          (p.client_name || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const dateA = new Date(a.start_date || 0).getTime();
        const dateB = new Date(b.start_date || 0).getTime();
        return dateB - dateA;
      });
  }, [projects, search, statusFilter, pocFilter, dateFrom, dateTo]);

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(
      PROJECT_STATUSES.map((s) => [s, []])
    );

    filtered.forEach((p) => {
      if (map[p.status]) {
        map[p.status].push(p);
      }
    });

    return map;
  }, [filtered]);

  useEffect(() => {
    setListPage(1);
  }, [search, statusFilter, pocFilter, dateFrom, dateTo, visibility]);

  const toggleColumnVisibility = (status) => {
    setHiddenColumns((current) => {
      const next = new Set(current);

      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }

      localStorage.setItem(
        "pmt-hidden-project-columns",
        JSON.stringify([...next])
      );

      return next;
    });
  };

  const visibleStatuses = PROJECT_STATUSES.filter(
    (status) => !hiddenColumns.has(status)
  );

  const hiddenStatuses = PROJECT_STATUSES.filter((status) =>
    hiddenColumns.has(status)
  );

  const toggleProjectSelection = (projectId) => {
    setSelectedProjects((current) => {
      const next = new Set(current);

      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }

      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedProjects(new Set(filtered.map((p) => p.id)));
  };

  const toggleColumnSelection = (columnProjects) => {
    const projectIds = columnProjects.map((project) => project.id);

    if (projectIds.length === 0) return;

    setSelectedProjects((current) => {
      const next = new Set(current);

      const allSelected = projectIds.every((id) => next.has(id));

      if (allSelected) {
        projectIds.forEach((id) => next.delete(id));
      } else {
        projectIds.forEach((id) => next.add(id));
      }

      return next;
    });
  };

  const selectPage = (ids, checked) => {
    setSelectedProjects((current) => {
      const next = new Set(current);

      ids.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });

      return next;
    });
  };

  const clearSelection = () => {
    setSelectedProjects(new Set());
  };

  const handleHideProject = async (project) => {
    try {
      await hideProject(currentUserId, project.id);

      toast.success("Project hidden");

      setSelectedProjects((current) => {
        const next = new Set(current);
        next.delete(project.id);
        return next;
      });

      await fetchAll();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to hide project"
      );
    }
  };

  const handleUnhideProject = async (project) => {
    try {
      await unhideProject(currentUserId, project.id);

      toast.success("Project restored");

      await fetchAll();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to unhide project"
      );
    }
  };

  const handleBulkHide = async () => {
    const ids = [...selectedProjects];

    if (!ids.length) return;

    try {
      await bulkHideProjects(currentUserId, ids);

      toast.success(
        `${ids.length} project${ids.length === 1 ? "" : "s"} hidden`
      );

      clearSelection();
      await fetchAll();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to hide projects"
      );
    }
  };

  const handleBulkUnhide = async () => {
    const ids = [...selectedProjects];

    if (!ids.length) return;

    try {
      await bulkUnhideProjects(currentUserId, ids);

      toast.success(
        `${ids.length} project${ids.length === 1 ? "" : "s"} restored`
      );

      clearSelection();
      await fetchAll();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to restore projects"
      );
    }
  };

  const handleBulkStatusChange = async (newStatus) => {
    const ids = [...selectedProjects];

    if (!ids.length || !newStatus) return;

    try {
      await bulkUpdateProjectStatus(
        currentUserId,
        ids,
        newStatus
      );

      toast.success(
        `${ids.length} project${ids.length === 1 ? "" : "s"} moved to ${newStatus}`
      );

      clearSelection();
      await fetchAll();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail ||
          "Failed to change project status"
      );
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedProjects];

    if (!ids.length) return;

    try {
      await bulkDeleteProjects(currentUserId, ids);

      toast.success(
        `${ids.length} project${ids.length === 1 ? "" : "s"} deleted`
      );

      setDeleteTarget(null);
      clearSelection();
      await fetchAll();
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to delete projects"
      );
    }
  };

  const dateRange = {
    from: dateFrom ? parseISO(dateFrom) : undefined,
    to: dateTo ? parseISO(dateTo) : undefined,
  };

  const handleDateRangeChange = (range) => {
    setDateFrom(range?.from ? format(range.from, "yyyy-MM-dd") : "");
    setDateTo(range?.to ? format(range.to, "yyyy-MM-dd") : "");
  };

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
      <div className="mb-5">
        {/* Page header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Projects{" "}
              <span className="text-lg font-medium text-muted-foreground">
                {projects.length}
              </span>
            </h1>

            <p className="mt-1 text-base text-muted-foreground">
              Manage projects, deliverables and production timelines.
            </p>
          </div>

          <button
            type="button"
            data-testid={PROJECTS.newProjectBtn}
            onClick={() => setModalOpen(true)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#23239b]"
          >
            <Plus className="h-4 w-4" />
            New Project
          </button>
        </div>

        {/* Filters + view switcher */}
        <div className="flex w-full items-center gap-2">
          {/* Search */}
          <div className="min-w-0 flex-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

              <input
                data-testid={PROJECTS.searchInput}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search project name..."
                className="h-10 w-full rounded-lg border border-input bg-white pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
              />
            </div>
          </div>

          {/* Status */}
          <select
            data-testid={PROJECTS.statusFilter}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 w-[150px] shrink-0 rounded-lg border border-input bg-white px-3 text-sm font-medium text-foreground outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
          >
            <option value="">All status</option>
            {PROJECT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          {/* POC */}
          <select
            value={pocFilter}
            onChange={(e) => setPocFilter(e.target.value)}
            className="h-10 w-[190px] shrink-0 rounded-lg border border-input bg-white px-3 text-sm font-medium text-foreground outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
          >
            <option value="">All POCs / Owners</option>
            {pocOptions.map((poc) => (
              <option key={poc} value={poc}>
                {poc}
              </option>
            ))}
          </select>

          {/* Date range */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={[
                  "inline-flex h-10 w-[205px] shrink-0 items-center gap-2 rounded-lg border bg-white px-3 text-sm outline-none transition-colors",
                  "focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20",
                  dateFrom || dateTo
                    ? "border-[#2b2bb5] text-foreground"
                    : "border-input text-muted-foreground",
                ].join(" ")}
              >
                <CalendarDays className="h-4 w-4 shrink-0" />

                {dateFrom && dateTo ? (
                  <span>
                    {format(parseISO(dateFrom), "dd MMM")} –{" "}
                    {format(parseISO(dateTo), "dd MMM")}
                  </span>
                ) : dateFrom ? (
                  <span>
                    From {format(parseISO(dateFrom), "dd MMM")}
                  </span>
                ) : (
                  <span>Select date range</span>
                )}
              </button>
            </PopoverTrigger>

            <PopoverContent
              align="start"
              className="w-auto rounded-xl p-0"
            >
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={handleDateRangeChange}
                numberOfMonths={1}
                initialFocus
              />

              {(dateFrom || dateTo) && (
                <div className="border-t border-border px-4 py-3">
                  <button
                    type="button"
                    onClick={() => {
                      setDateFrom("");
                      setDateTo("");
                    }}
                    className="text-xs font-medium text-[#2b2bb5] hover:underline"
                  >
                    Clear date range
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* Visibility */}
          <select
            value={visibility}
            onChange={(e) => {
              setVisibility(e.target.value);
              clearSelection();
            }}
            className="h-10 w-[165px] shrink-0 rounded-lg border border-input bg-white px-3 text-sm font-medium text-foreground outline-none focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20"
          >
            <option value="visible">Visible projects</option>
            <option value="hidden">Hidden projects</option>
            <option value="all">All projects</option>
          </select>

          {/* View switcher — icons only */}
          <div className="flex h-10 shrink-0 items-center rounded-lg border border-input bg-white p-1">
            <button
              type="button"
              data-testid={PROJECTS.chartViewBtn}
              onClick={() => setView("chart")}
              title="Kanban view"
              aria-label="Kanban view"
              className={[
                "flex h-8 w-9 items-center justify-center rounded-md transition-colors",
                view === "chart"
                  ? "bg-[#f0f0ff] text-[#2b2bb5]"
                  : "text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>

            <button
              type="button"
              data-testid={PROJECTS.listViewBtn}
              onClick={() => setView("list")}
              title="List view"
              aria-label="List view"
              className={[
                "flex h-8 w-9 items-center justify-center rounded-md transition-colors",
                view === "list"
                  ? "bg-[#f0f0ff] text-[#2b2bb5]"
                  : "text-muted-foreground hover:bg-muted",
              ].join(" ")}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Active filter chips */}
      {(pocFilter || statusFilter || dateFrom || dateTo) && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {pocFilter && (
            <button
              type="button"
              onClick={() => setPocFilter("")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              POC: {pocFilter}
              <X className="h-3 w-3" />
            </button>
          )}

          {statusFilter && (
            <button
              type="button"
              onClick={() => setStatusFilter("")}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              Status: {statusFilter}
              <X className="h-3 w-3" />
            </button>
          )}

          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ff] px-3 py-1.5 text-xs font-medium text-[#2b2bb5]"
            >
              Due: {dateFrom || "Any"} – {dateTo || "Any"}
              <X className="h-3 w-3" />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setPocFilter("");
              setStatusFilter("");
              setDateFrom("");
              setDateTo("");
              setSearch("");
            }}
            className="ml-1 text-xs font-medium text-[#2b2bb5] hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

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

      {/* Bulk actions */}
      <ProjectBulkActionBar
        selectedCount={selectedProjects.size}
        totalCount={filtered.length}
        visibility={visibility}
        statuses={PROJECT_STATUSES}
        onSelectAll={selectAllFiltered}
        onHide={handleBulkHide}
        onUnhide={handleBulkUnhide}
        onChangeStatus={handleBulkStatusChange}
        onDelete={() => setDeleteTarget("bulk")}
        onClear={clearSelection}
      />

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
        <>
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-800">
              Kanban View
            </div>

            {hiddenStatuses.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Hidden:</span>

                {hiddenStatuses.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleColumnVisibility(status)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-[#c8c8ee] hover:text-[#2b2bb5]"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {status}
                  </button>
                ))}
              </div>
            )}
          </div>

          <KanbanBoard minWidth="1920px">
            {visibleStatuses.map((status) => {
              const columnProjects = byStatus[status] || [];

              const columnProjectIds = columnProjects.map(
                (project) => project.id
              );

              const allColumnProjectsSelected =
                columnProjectIds.length > 0 &&
                columnProjectIds.every((id) => selectedProjects.has(id));

              return (
                <KanbanColumn
                  key={status}
                  status={status}
                  projects={columnProjects}
                  users={users}
                  selectedProjects={selectedProjects}
                  onSelectProject={toggleProjectSelection}
                  onSelectAll={() => toggleColumnSelection(columnProjects)}
                  allSelected={allColumnProjectsSelected}
                  onOpenProject={(project) =>
                    navigate(`/projects/${project.id}`)
                  }
                  onToggleVisibility={toggleColumnVisibility}
                />
              );
            })}
          </KanbanBoard>
        </>
      ) : (
        <ProjectListTable
          projects={filtered}
          users={users}
          selectedProjects={selectedProjects}
          onSelectProject={toggleProjectSelection}
          onSelectPage={selectPage}
          onOpenProject={(p) => navigate(`/projects/${p.id}`)}
          onHideProject={handleHideProject}
          onUnhideProject={handleUnhideProject}
          onDeleteProject={(p) => setDeleteTarget(p)}
          page={listPage}
          setPage={setListPage}
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

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={
          deleteTarget === "bulk"
            ? handleBulkDelete
            : async () => {
                try {
                  await deleteProject(currentUserId, deleteTarget.id);

                  toast.success("Project deleted");

                  setDeleteTarget(null);
                  await fetchAll();
                } catch (err) {
                  toast.error(
                    err?.response?.data?.detail ||
                      "Failed to delete project"
                  );
                }
              }
        }
        title={
          deleteTarget === "bulk"
            ? `Delete ${selectedProjects.size} projects?`
            : "Delete this project?"
        }
        description={
          deleteTarget === "bulk"
            ? "These projects and their deliverables will be permanently deleted."
            : "This project and its deliverables will be permanently deleted."
        }
        warning="Historical work entries will be preserved."
        confirmLabel="Delete"
      />
    </div>
  );
}