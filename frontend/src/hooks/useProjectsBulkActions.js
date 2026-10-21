import { toast } from "sonner";
import {
  hideProject,
  unhideProject,
  bulkHideProjects,
  bulkUnhideProjects,
  bulkUpdateProjectStatus,
  bulkDeleteProjects,
} from "@/services/api";

// Hide / restore / status-change / delete for one project or the selection.
export function useProjectsBulkActions({ currentUserId, pushUndo, fetchAll, projects, selectedProjects, setSelectedProjects, clearSelection, setDeleteTarget }) {
  const handleHideProject = async (project) => {
    try {
      await hideProject(currentUserId, project.id);

      pushUndo("hid project", async () => {
        await unhideProject(currentUserId, project.id);
        await fetchAll(false);
      });
      toast.success("Project hidden");

      setSelectedProjects((current) => {
        const next = new Set(current);
        next.delete(project.id);
        return next;
      });

      await fetchAll(false);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to hide project"
      );
    }
  };

  const handleUnhideProject = async (project) => {
    try {
      await unhideProject(currentUserId, project.id);

      pushUndo("restored project", async () => {
        await hideProject(currentUserId, project.id);
        await fetchAll(false);
      });
      toast.success("Project restored");

      await fetchAll(false);
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

      pushUndo(`hid ${ids.length} project${ids.length === 1 ? "" : "s"}`, async () => {
        await bulkUnhideProjects(currentUserId, ids);
        await fetchAll(false);
      });
      toast.success(
        `${ids.length} project${ids.length === 1 ? "" : "s"} hidden`
      );

      clearSelection();
      await fetchAll(false);
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

      pushUndo(`restored ${ids.length} project${ids.length === 1 ? "" : "s"}`, async () => {
        await bulkHideProjects(currentUserId, ids);
        await fetchAll(false);
      });
      toast.success(
        `${ids.length} project${ids.length === 1 ? "" : "s"} restored`
      );

      clearSelection();
      await fetchAll(false);
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
      // Remember each project's status so it can be put back.
      const statusBefore = new Map();
      projects.forEach((project) => {
        if (ids.includes(project.id)) {
          if (!statusBefore.has(project.status)) statusBefore.set(project.status, []);
          statusBefore.get(project.status).push(project.id);
        }
      });

      await bulkUpdateProjectStatus(
        currentUserId,
        ids,
        newStatus
      );

      pushUndo(`status change on ${ids.length} project${ids.length === 1 ? "" : "s"}`, async () => {
        for (const [oldStatus, oldIds] of statusBefore) {
          await bulkUpdateProjectStatus(currentUserId, oldIds, oldStatus);
        }
        await fetchAll(false);
      });

      toast.success(
        `${ids.length} project${ids.length === 1 ? "" : "s"} moved to ${newStatus}`
      );

      clearSelection();
      await fetchAll(false);
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
      await fetchAll(false);
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Failed to delete projects"
      );
    }
  };

  return {
    handleHideProject,
    handleUnhideProject,
    handleBulkHide,
    handleBulkUnhide,
    handleBulkStatusChange,
    handleBulkDelete,
  };
}
