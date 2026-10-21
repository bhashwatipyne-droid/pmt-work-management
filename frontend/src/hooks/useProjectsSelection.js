
// Row / card / column selection for the Projects page.
export function useProjectsSelection({ filtered, setSelectedProjects }) {
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

  return {
    toggleProjectSelection,
    selectAllFiltered,
    toggleColumnSelection,
    selectPage,
    clearSelection,
  };
}
