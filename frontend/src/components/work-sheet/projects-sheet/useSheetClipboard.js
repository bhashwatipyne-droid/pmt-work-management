import { DATE_FIELD, TEXT_FIELD, isStakeholder } from "@/components/work-sheet/projects-sheet/sheetColumns";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

export function useSheetClipboard({ activeUsers, canEdit, cell, checkDragRef, clients, cols, dragSelRef, fillRef, fillTo, flatRows, inGroup, noteFor, options, rangeEnd, save, saveNote, setCell, setFillTo, setRangeEnd, taskById, undoRef, views }) {
  const rowIndex = (id) => flatRows.findIndex((x) => x.id === id);
  const colIndex = (key) => cols.findIndex((c) => c.key === key);
  const block = (() => {
    if (!cell) return null;
    const a = rowIndex(cell.r);
    const b = colIndex(cell.c);
    if (a < 0 || b < 0) return null;
    const end = rangeEnd ? { r: rowIndex(rangeEnd.r), c: colIndex(rangeEnd.c) } : { r: a, c: b };
    if (end.r < 0 || end.c < 0) return { r1: a, r2: a, c1: b, c2: b };
    return { r1: Math.min(a, end.r), r2: Math.max(a, end.r), c1: Math.min(b, end.c), c2: Math.max(b, end.c) };
  })();
  const isMulti = !!block && (block.r1 !== block.r2 || block.c1 !== block.c2);
  const fillIdx = fillTo ? rowIndex(fillTo) : -1;

  const parseDay = (text) => {
    const v = (text || "").trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m) return v;
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(v);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return undefined;
  };
  const pickName = (list, text) => list.find((o) => o.toLowerCase() === text.trim().toLowerCase());

  // What a pasted / typed value means for a column: { fields } or { note }.
  const fromText = (t, key, text) => {
    const v = (text ?? "").trim();
    if (TEXT_FIELD[key]) return { fields: { [TEXT_FIELD[key]]: v } };
    if (key === "remark") return { note: v };
    if (key === "count") return /^\d*$/.test(v) ? { fields: { deliverable_count: v ? Number(v) : null } } : null;
    if (DATE_FIELD[key]) {
      if (!v) return key === "date" ? null : { fields: { [DATE_FIELD[key]]: null } };
      const day = parseDay(v);
      return day ? { fields: { [DATE_FIELD[key]]: day } } : null;
    }
    if (key === "type") {
      const type = v ? pickName(options.task_types || [], v) : "";
      return type === undefined ? null : { fields: { task_type: type } };
    }
    if (key === "status") {
      const st = pickName(options.statuses || [], v);
      return st ? { fields: { status: st } } : null;
    }
    if (key === "client") {
      if (!v) return { fields: { client_id: null } };
      const c = clients.find((x) => (x.name || "").toLowerCase() === v.toLowerCase());
      return c ? { fields: { client_id: c.id } } : null;
    }
    if (key === "owner") {
      const name = v.replace(/\s*\+\d+$/, "").toLowerCase();
      const u = activeUsers.filter(isStakeholder).find((x) => (x.name || "").toLowerCase() === name);
      return u ? { fields: { owner_id: u.id } } : null;
    }
    if (key === "followup") {
      const teams = [];
      const people = [];
      const others = [];
      v.split(",").map((x) => x.trim()).filter(Boolean).forEach((part) => {
        const team = pickName(options.teams || [], part);
        const person = activeUsers.find(
          (u) => (u.name || "").toLowerCase() === part.toLowerCase() || (u.name || "").split(" ")[0].toLowerCase() === part.toLowerCase()
        );
        if (team) teams.push(team);
        else if (person) people.push(person.id);
        else others.push(part);
      });
      return { fields: { follow_up_teams: teams, follow_up_user_ids: people, follow_up_others: others.join(", ") } };
    }
    return null;
  };

  // A cell's raw value, to copy it onto other rows with the fill handle.
  const rawOf = (t, key) => {
    if (TEXT_FIELD[key]) return { fields: { [TEXT_FIELD[key]]: t[TEXT_FIELD[key]] || "" } };
    if (DATE_FIELD[key]) return t[DATE_FIELD[key]] || key !== "date" ? { fields: { [DATE_FIELD[key]]: t[DATE_FIELD[key]] || null } } : null;
    if (key === "remark") return { note: noteFor(t.id) };
    if (key === "count") return { fields: { deliverable_count: t.deliverable_count ?? null } };
    if (key === "type") return { fields: { task_type: t.task_type || "" } };
    if (key === "status") return { fields: { status: t.status } };
    if (key === "client") return { fields: { client_id: t.client_id || null } };
    if (key === "owner") return { fields: { owner_id: t.owner_id || null, collaborator_ids: t.collaborator_ids || [] } };
    if (key === "followup")
      return {
        fields: {
          follow_up_teams: t.follow_up_teams || [],
          follow_up_user_ids: t.follow_up_user_ids || [],
          follow_up_others: t.follow_up_others || "",
        },
      };
    return null;
  };

  const apply = (t, change) => {
    if (!change || !t) return 0;
    if (change.note !== undefined) {
      if (change.note === noteFor(t.id)) return 0;
      saveNote(t, change.note);
      return 1;
    }
    const changed = Object.entries(change.fields).some(([k, val]) => JSON.stringify(t[k] ?? null) !== JSON.stringify(val ?? null));
    if (!changed) return 0;
    save(t, change.fields);
    return 1;
  };

  const blockText = () => {
    if (!block) return "";
    return flatRows
      .slice(block.r1, block.r2 + 1)
      .map((t) => {
        const v = views.get(t.id);
        return cols
          .slice(block.c1, block.c2 + 1)
          .map((c) => String((c.key === "owner" ? v.ownerText : v[c.key]) ?? "").replace(/[\t\n]/g, " "))
          .join("\t");
      })
      .join("\n");
  };

  const copyBlock = () => {
    const text = blockText();
    if (!navigator.clipboard) {
      toast.error("Clipboard access isn't available here");
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() => {
        const n = (block.r2 - block.r1 + 1) * (block.c2 - block.c1 + 1);
        toast(`Copied ${n} cell${n === 1 ? "" : "s"}`);
      })
      .catch(() => toast.error("Couldn't copy"));
  };

  const pasteText = (text) => {
    if (!block || !canEdit) return;
    const grid = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
    const single = grid.length === 1 && grid[0].length === 1;
    // One value pasted over a block fills the block, as in a spreadsheet.
    const rowsN = single ? block.r2 - block.r1 + 1 : grid.length;
    const colsN = single ? block.c2 - block.c1 + 1 : grid[0].length;
    let changed = 0;
    let skipped = 0;
    inGroup(() => {
      for (let i = 0; i < rowsN; i += 1) {
        const t = flatRows[block.r1 + i];
        if (!t) break;
        for (let j = 0; j < colsN; j += 1) {
          const col = cols[block.c1 + j];
          if (!col) break;
          const value = single ? grid[0][0] : grid[i]?.[j];
          if (value === undefined) continue;
          const change = fromText(t, col.key, value);
          if (!change) skipped += 1;
          else changed += apply(t, change);
        }
      }
    });
    if (changed) toast(`Pasted into ${changed} cell${changed === 1 ? "" : "s"}`);
    if (skipped) toast.error(`${skipped} value${skipped === 1 ? "" : "s"} didn't fit the column and ${skipped === 1 ? "was" : "were"} skipped`);
  };

  const clearBlock = () => {
    if (!block || !canEdit) return;
    inGroup(() => {
      flatRows.slice(block.r1, block.r2 + 1).forEach((t) =>
        cols.slice(block.c1, block.c2 + 1).forEach((c) => {
          if (["owner", "status", "date"].includes(c.key)) return; // can't be empty
          apply(t, fromText(t, c.key, ""));
        })
      );
    });
  };

  const undo = () => {
    const group = undoRef.current.pop();
    if (!group) {
      toast("Nothing to undo");
      return;
    }
    [...group].reverse().forEach((e) => {
      const t = taskById.get(e.id);
      if (!t) return;
      if (e.note !== undefined) saveNote(t, e.note, true);
      else save(t, e.before, true);
    });
    toast(`Undid ${group.length} change${group.length === 1 ? "" : "s"}`);
  };

  // The fill handle: copy the selected cell(s) down (or up) the rows dragged over.
  const finishFill = () => {
    const to = fillTo ? rowIndex(fillTo) : -1;
    fillRef.current = false;
    setFillTo(null);
    if (!block || to < 0 || (to >= block.r1 && to <= block.r2)) return;
    const n = block.r2 - block.r1 + 1;
    const targets = to > block.r2 ? [...Array(to - block.r2).keys()].map((k) => block.r2 + 1 + k) : [...Array(block.r1 - to).keys()].map((k) => to + k);
    let changed = 0;
    inGroup(() => {
      targets.forEach((i) => {
        const src = flatRows[block.r1 + ((((i - block.r1) % n) + n) % n)];
        cols.slice(block.c1, block.c2 + 1).forEach((c) => {
          changed += apply(flatRows[i], rawOf(src, c.key));
        });
      });
    });
    if (changed) toast(`Filled ${changed} cell${changed === 1 ? "" : "s"}`);
    setRangeEnd({ r: flatRows[Math.max(...targets, block.r2)].id, c: cols[block.c2].key });
    setCell({ r: flatRows[Math.min(...targets, block.r1)].id, c: cols[block.c1].key });
  };
  const finishFillRef = useRef(finishFill);
  finishFillRef.current = finishFill;

  useEffect(() => {
    const up = () => {
      dragSelRef.current = false;
      checkDragRef.current = null;
      if (fillRef.current) finishFillRef.current();
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return { colIndex, block, isMulti, fillIdx, apply, copyBlock, pasteText, clearBlock, undo };
}
