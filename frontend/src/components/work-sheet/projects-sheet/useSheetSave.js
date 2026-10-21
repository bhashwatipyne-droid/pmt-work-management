import { setProjectTaskUpdate, updateProjectTask } from "@/services/api";
import { toast } from "sonner";
import { useCallback, useRef } from "react";

export function useSheetSave({ currentUser, noteFor, refDay, setTasks, setUpdates }) {
  // Undo (Ctrl+Z): each change remembers what it replaced. Changes made
  // together (a paste, a fill, a bulk status) undo together.
  const undoRef = useRef([]);
  const groupRef = useRef(null);
  const record = (entry) => {
    if (groupRef.current) groupRef.current.push(entry);
    else {
      undoRef.current.push([entry]);
      if (undoRef.current.length > 50) undoRef.current.shift();
    }
  };
  const inGroup = (fn) => {
    groupRef.current = [];
    try {
      fn();
    } finally {
      const g = groupRef.current;
      groupRef.current = null;
      if (g.length) undoRef.current.push(g);
    }
  };

  const save = useCallback(
    (task, fields, noUndo) => {
      if (!noUndo) record({ id: task.id, before: Object.fromEntries(Object.keys(fields).map((k) => [k, task[k] ?? null])) });
      setTasks((list) => list.map((t) => (t.id === task.id ? { ...t, ...fields } : t)));
      return updateProjectTask(task.id, { ...fields, day: refDay })
        .then((saved) => setTasks((list) => list.map((t) => (t.id === task.id ? saved : t))))
        .catch((err) => {
          setTasks((list) => list.map((t) => (t.id === task.id ? task : t)));
          toast.error(err?.response?.data?.detail || "Couldn't save that change");
        });
    },
    [refDay]
  );

  const saveNote = (task, note, noUndo) => {
    if (!noUndo) record({ id: task.id, note: noteFor(task.id) });
    setUpdates((list) => [
      ...list.filter((u) => !(u.task_id === task.id && u.day === refDay)),
      ...(note ? [{ task_id: task.id, day: refDay, note, user_id: currentUser?.id }] : []),
    ]);
    setProjectTaskUpdate(task.id, refDay, note).catch(() => toast.error("Couldn't save the remark"));
  };


  return { undoRef, inGroup, save, saveNote };
}
