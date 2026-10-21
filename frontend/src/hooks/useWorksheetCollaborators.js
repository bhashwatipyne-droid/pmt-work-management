import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { refreshCounts } from "@/lib/countsBus";
import { DEPARTMENT_TO_STAGE } from "@/lib/worksheetView";
import { addWorkItemCollaborators } from "@/services/api";

// Tagging teammates on Work Sheet entries: which entries share a collaboration
// group, who can be tagged from the bulk bar, and the tag action itself.
export function useWorksheetCollaborators({
  currentUser,
  items,
  users,
  selectedIds,
  setItems,
  setSelectedIds,
}) {
  const collabIndex = useMemo(() => {
    const groups = new Map();
    for (const row of items) {
      if (!row.collab_group_id) continue;
      const list = groups.get(row.collab_group_id);
      if (list) list.push(row.creator_id);
      else groups.set(row.collab_group_id, [row.creator_id]);
    }
    return groups;
  }, [items]);

  // Who can be tagged from the bulk bar: people whose team works the selected
  // rows' stage(s). The server re-checks every pair and says why it skipped one.
  const bulkCollabPeople = useMemo(() => {
    if (!selectedIds.length) return [];
    const picked = new Set(selectedIds);
    const stages = new Set(
      items.filter((row) => picked.has(row.id)).map((row) => row.stage || "")
    );
    return (users || [])
      .filter(
        (u) =>
          u.role !== "admin" &&
          u.role !== "hr" &&
          u.active !== false &&
          (stages.has("") || stages.has(DEPARTMENT_TO_STAGE[u.department]))
      )
      .map((u) => ({ id: u.id, name: u.name, department: u.department }));
  }, [selectedIds, items, users]);

  const COLLAB_REASONS = {
    owner: "Owns this entry already",
    already_has_entry: "Already has this entry",
    different_stage: "Works in another team",
    not_available: "Not available",
  };

  // Tag people on one or more entries. Each person gets their own row; anyone
  // who already has the entry is skipped by the server, so repeating this adds
  // nothing. Returns { problems } for the picker to show inline.
  const handleAddCollaborators = useCallback(
    async (rowIds, creatorIds) => {
      let result;
      try {
        result = await addWorkItemCollaborators(currentUser.id, rowIds, creatorIds);
      } catch (e) {
        throw new Error(e.response?.data?.detail || "Could not add collaborators. Try again.");
      }

      const created = result.created || [];
      const sourceById = Object.fromEntries((result.updated_sources || []).map((r) => [r.id, r]));
      if (created.length || Object.keys(sourceById).length) {
        setItems((prev) => {
          const have = new Set(prev.map((r) => r.id));
          return [
            ...created.filter((r) => !have.has(r.id)),
            ...prev.map((r) => sourceById[r.id] || r),
          ];
        });
        refreshCounts();
      }

      const makers = new Set(created.map((r) => r.creator_id));
      const problems = [];

      // Whole-entry refusals (not yours, still blank, ...), once each.
      const rowReasons = new Map();
      (result.row_errors || []).forEach((e) =>
        rowReasons.set(e.reason, (rowReasons.get(e.reason) || 0) + 1)
      );
      rowReasons.forEach((count, reason) =>
        problems.push({
          text: rowIds.length > 1 ? `${count} ${count === 1 ? "entry" : "entries"}: ${reason}` : reason,
        })
      );

      // People who got nothing, with the reason.
      const reasonsByPerson = new Map();
      (result.skipped || []).forEach((sk) => {
        if (makers.has(sk.creator_id)) return;
        reasonsByPerson.set(sk.creator_id, COLLAB_REASONS[sk.reason] || sk.reason);
      });
      reasonsByPerson.forEach((text, id) => problems.push({ id, text }));

      const people = makers.size;
      if (created.length) {
        const skippedCount = (result.skipped || []).length;
        toast.success(
          `Added ${people} ${people === 1 ? "person" : "people"} (${created.length} new ${created.length === 1 ? "row" : "rows"})` +
            (skippedCount ? ` · ${skippedCount} skipped` : "")
        );
      }
      // Keep the selection (and the picker's inline notes) while anything was refused.
      if (rowIds.length > 1 && created.length && !problems.length) setSelectedIds([]);
      return { problems };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser]
  );

  return { collabIndex, bulkCollabPeople, handleAddCollaborators };
}
