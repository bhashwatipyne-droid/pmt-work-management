import { createProjectTask, deleteProjectTask } from "@/services/api";
import { toast } from "sonner";
import { useState } from "react";

export function useSheetRows({ flatRows, inGroup, lastSelRef, pendingEditRef, refDay, save, sel, setConfirmDelete, setDeleting, setFilters, setQuery, setSel, setStatusMenu, setTasks, taskById }) {
  const addRow = () => {
    createProjectTask({ day: refDay })
      .then((task) => {
        setQuery("");
        setFilters({});
        pendingEditRef.current = task.id;
        setTasks((list) => [...list, task]);
      })
      .catch((err) => toast.error(err?.response?.data?.detail || "Couldn't add a row"));
  };

  // Add row ▾: several blank rows at once.
  const [addingRows, setAddingRows] = useState(false);
  const addRows = async (n) => {
    if (n === 1) {
      addRow();
      return;
    }
    setAddingRows(true);
    const made = [];
    for (let i = 0; i < n; i += 1) {
      try {
        made.push(await createProjectTask({ day: refDay }));
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Couldn't add a row");
        break;
      }
    }
    setAddingRows(false);
    if (made.length) {
      setQuery("");
      setFilters({});
      setTasks((list) => [...list, ...made]);
      toast(`Added ${made.length} rows`);
    }
  };

  // --- Row selection + bulk actions -------------------------------------
  const selIds = Object.keys(sel).filter((id) => sel[id] && taskById.get(id));
  const visIds = flatRows.map((t) => t.id);
  const allVisSel = visIds.length > 0 && visIds.every((id) => sel[id]);
  const someVisSel = !allVisSel && visIds.some((id) => sel[id]);

  const toggleRow = (id, shift) => {
    if (shift && lastSelRef.current) {
      const a = visIds.indexOf(lastSelRef.current);
      const b = visIds.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [from, to] = a < b ? [a, b] : [b, a];
        const on = !sel[id];
        setSel((s) => {
          const next = { ...s };
          visIds.slice(from, to + 1).forEach((x) => (next[x] = on));
          return next;
        });
        lastSelRef.current = id;
        return;
      }
    }
    lastSelRef.current = id;
    setSel((s) => ({ ...s, [id]: !s[id] }));
  };

  const bulkStatus = (status) => {
    setStatusMenu(false);
    inGroup(() => selIds.forEach((id) => save(taskById.get(id), { status })));
    toast(`Set ${selIds.length} task${selIds.length === 1 ? "" : "s"} to ${status}`);
  };

  const bulkDuplicate = async () => {
    const copies = [];
    for (const id of selIds) {
      const t = taskById.get(id);
      const fields = {
        task: t.task,
        task_type: t.task_type,
        client_id: t.client_id,
        project_id: t.project_id,
        spoc: t.spoc,
        owner_id: t.owner_id,
        collaborator_ids: t.collaborator_ids,
        follow_up_teams: t.follow_up_teams,
        follow_up_user_ids: t.follow_up_user_ids,
        follow_up_others: t.follow_up_others,
        internal_follow_up_date: t.internal_follow_up_date,
        client_follow_up_date: t.client_follow_up_date,
        meeting_time: t.meeting_time,
        deliverable_count: t.deliverable_count,
        day: refDay,
      };
      try {
        copies.push(await createProjectTask(fields));
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Couldn't duplicate a row");
      }
    }
    if (copies.length) {
      setTasks((list) => [...list, ...copies]);
      setSel(Object.fromEntries(copies.map((c) => [c.id, true])));
      toast(`Duplicated ${copies.length} row${copies.length === 1 ? "" : "s"}`);
    }
  };

  const bulkDelete = async () => {
    setDeleting(true);
    const gone = [];
    for (const id of selIds) {
      try {
        await deleteProjectTask(id);
        gone.push(id);
      } catch (err) {
        toast.error(err?.response?.data?.detail || "Couldn't delete a row");
      }
    }
    setTasks((list) => list.filter((t) => !gone.includes(t.id)));
    setSel({});
    setDeleting(false);
    setConfirmDelete(false);
    if (gone.length) toast(`Deleted ${gone.length} row${gone.length === 1 ? "" : "s"}`);
  };


  return { addRow, addRows, selIds, visIds, allVisSel, someVisSel, toggleRow, bulkStatus, bulkDuplicate, bulkDelete, addingRows };
}
