import { toast } from "sonner";
import { reorderProjects } from "@/services/api";

// Drag-to-reorder / drag-to-move on the Kanban board.
export function useProjectsDragDrop({ canManage, draggedProjectId, setDraggedProjectId, setDragOverProjectId, setDragOverStatus, projects, setProjects, currentUserId, pushUndo, fetchAll }) {
  const getColumnProjectIds = (status) =>
    projects
      .filter((project) => project.status === status)
      .sort((a, b) => {
        const orderA = Number.isFinite(Number(a.kanban_order))
          ? Number(a.kanban_order)
          : Number.MAX_SAFE_INTEGER;
        const orderB = Number.isFinite(Number(b.kanban_order))
          ? Number(b.kanban_order)
          : Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return new Date(b.start_date || 0).getTime() - new Date(a.start_date || 0).getTime();
      })
      .map((project) => project.id);

  const handleProjectDragStart = (event, project) => {
    setDraggedProjectId(project.id);
    setDragOverProjectId(null);
    setDragOverStatus(project.status);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/project-id", project.id);
  };

  const handleProjectDragEnd = () => {
    setDraggedProjectId(null);
    setDragOverProjectId(null);
    setDragOverStatus(null);
  };

  const handleProjectDragOver = (event, project) => {
    if (!draggedProjectId || draggedProjectId === project.id) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverProjectId(project.id);
    setDragOverStatus(project.status);
  };

  const handleColumnDragOver = (event, status) => {
    if (!draggedProjectId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverProjectId(null);
    setDragOverStatus(status);
  };

  const persistProjectDrop = async (status, targetIndex) => {
    if (!canManage || !draggedProjectId) return;

    const draggedProject = projects.find((project) => project.id === draggedProjectId);
    if (!draggedProject) return;

    const oldStatus = draggedProject.status;
    const oldIndex = getColumnProjectIds(oldStatus).indexOf(draggedProjectId);
    const sourceIds = getColumnProjectIds(oldStatus).filter(
      (id) => id !== draggedProjectId
    );
    const targetIds = getColumnProjectIds(status).filter(
      (id) => id !== draggedProjectId
    );

    if (oldStatus === status) {
      targetIndex = Math.max(0, Math.min(targetIndex, targetIds.length));
      targetIds.splice(targetIndex, 0, draggedProjectId);
    } else {
      targetIndex = Math.max(0, Math.min(targetIndex, targetIds.length));
      targetIds.splice(targetIndex, 0, draggedProjectId);
    }

    // Optimistic update so the board moves immediately.
    const sourceOrder = oldStatus === status
      ? targetIds
      : sourceIds;
    const targetOrder = targetIds;
    const orderById = new Map();

    if (oldStatus !== status) {
      sourceOrder.forEach((id, index) => orderById.set(id, index));
      targetOrder.forEach((id, index) => orderById.set(id, index));
    } else {
      targetOrder.forEach((id, index) => orderById.set(id, index));
    }

    setProjects((current) =>
      current.map((project) => {
        if (project.id === draggedProjectId) {
          return {
            ...project,
            status,
            kanban_order: targetIndex,
          };
        }

        if (project.status === status && orderById.has(project.id)) {
          return { ...project, kanban_order: orderById.get(project.id) };
        }

        if (oldStatus !== status && project.status === oldStatus && orderById.has(project.id)) {
          return { ...project, kanban_order: orderById.get(project.id) };
        }

        return project;
      })
    );

    try {
      await reorderProjects(currentUserId, draggedProjectId, status, targetIndex);
      const movedId = draggedProjectId;
      pushUndo(oldStatus === status ? "project order change" : "project move", async () => {
        await reorderProjects(currentUserId, movedId, oldStatus, Math.max(0, oldIndex));
        await fetchAll(false);
      });
      toast.success(
        oldStatus === status ? "Project order updated" : `Project moved to ${status}`
      );
      // Refresh data without replacing the Kanban with the full-page loader.
      await fetchAll(false);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Could not move project"
      );
      // Revert/refresh silently without showing the full-page loader.
      await fetchAll(false);
    } finally {
      handleProjectDragEnd();
    }
  };

  const handleProjectDrop = async (event, targetProject) => {
    event.preventDefault();
    event.stopPropagation();

    if (!draggedProjectId || draggedProjectId === targetProject.id) {
      handleProjectDragEnd();
      return;
    }

    const targetProjects = getColumnProjectIds(targetProject.status).filter(
      (id) => id !== draggedProjectId
    );
    const targetIndex = targetProjects.indexOf(targetProject.id);
    await persistProjectDrop(targetProject.status, targetIndex < 0 ? 0 : targetIndex);
  };

  const handleColumnDrop = async (event, status) => {
    event.preventDefault();
    event.stopPropagation();

    if (!draggedProjectId) return;

    const targetIds = getColumnProjectIds(status).filter(
      (id) => id !== draggedProjectId
    );
    await persistProjectDrop(status, targetIds.length);
  };

  return {
    handleProjectDragStart,
    handleProjectDragEnd,
    handleProjectDragOver,
    handleColumnDragOver,
    handleProjectDrop,
    handleColumnDrop,
  };
}
