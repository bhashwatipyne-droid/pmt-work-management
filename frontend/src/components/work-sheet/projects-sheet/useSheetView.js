import { DATE_FIELD } from "@/components/work-sheet/projects-sheet/sheetColumns";
import { lateBy, nextFollowUp, sheetDate } from "@/components/work-sheet/projects-sheet/sheetDates";
import { makeMatcher } from "@/lib/search";
import { useCallback, useEffect, useMemo } from "react";

export function useSheetView({ clients, collapsed, didCollapseOnLoad, filters, groupBy, hiddenRows, inView, loading, openInMonth, query, ranges, refDay, setCollapsed, sort, tasks, updates, users }) {
  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const activeUsers = useMemo(
    () => users.filter((u) => u.active !== false).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [users]
  );
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const notesByTask = useMemo(() => {
    const map = new Map();
    [...updates]
      .sort((a, b) => (a.day || "").localeCompare(b.day || ""))
      .forEach((u) => {
        const list = map.get(u.task_id) || [];
        list.push(u);
        map.set(u.task_id, list);
      });
    return map;
  }, [updates]);

  const noteFor = useCallback(
    (taskId) => (notesByTask.get(taskId) || []).find((n) => n.day === refDay)?.note || "",
    [notesByTask, refDay]
  );

  // What each cell shows (and what search, sort and filters work on).
  const view = useCallback(
    (t) => {
      const owner = userById.get(t.owner_id)?.name || "";
      const extra = (t.collaborator_ids || []).length;
      const teams = t.follow_up_teams || [];
      const late = lateBy(t, refDay);
      const notes = notesByTask.get(t.id) || [];
      const note = notes.find((n) => n.day === refDay)?.note || [...notes].reverse().find((n) => n.day < refDay)?.note || "";
      return {
        task: t.task || "",
        type: t.task_type || "",
        client: clientById.get(t.client_id)?.name || "",
        owner,
        ownerText: owner ? `${owner}${extra ? ` +${extra}` : ""}` : "",
        followList: [
          ...teams,
          ...(t.follow_up_user_ids || []).map((id) => userById.get(id)?.name?.split(" ")[0]).filter(Boolean),
          ...(t.follow_up_others ? [t.follow_up_others] : []),
        ],
        followup: [
          ...teams,
          ...(t.follow_up_user_ids || []).map((id) => userById.get(id)?.name?.split(" ")[0]).filter(Boolean),
          ...(t.follow_up_others ? [t.follow_up_others] : []),
        ].join(", "),
        contact: t.spoc || "",
        count: t.deliverable_count ?? "",
        ifu: sheetDate(t.internal_follow_up_date),
        cfu: sheetDate(t.client_follow_up_date),
        status: t.status || "",
        meet: t.meeting_time || "",
        date: sheetDate(t.start_date),
        remark: [late ? `${late}d late` : "", t.delay_reason, note].filter(Boolean).join(" · "),
        late,
        due: !!nextFollowUp(t) && nextFollowUp(t) <= refDay && t.status !== "Done",
      };
    },
    [userById, clientById, notesByTask, refDay]
  );

  const views = useMemo(() => new Map(tasks.map((t) => [t.id, view(t)])), [tasks, view]);

  const fieldValue = (v, field) =>
    field === "follow"
      ? v.late > 0
        ? "Overdue"
        : v.due
          ? "Due"
          : ""
      : field === "with"
        ? v.followList // several per row: a row matches if any of them is picked
        : field === "owner"
          ? v.owner
          : v[field];
  const matchesField = (v, field, vals) => {
    const fv = fieldValue(v, field);
    return Array.isArray(fv) ? fv.some((x) => vals.includes(x)) : vals.includes(fv);
  };

  const dayTasks = useMemo(() => tasks.filter(inView), [tasks, inView]);
  const monthCount = useMemo(() => tasks.filter(openInMonth).length, [tasks, openInMonth]);

  const visible = useMemo(() => {
    const match = makeMatcher(query);
    return dayTasks.filter((t) => {
      if (hiddenRows[t.id]) return false;
      for (const [key, { from, to } = {}] of Object.entries(ranges)) {
        if (!from && !to) continue;
        const day = t[DATE_FIELD[key]];
        if (!day || (from && day < from) || (to && day > to)) return false;
      }
      const v = views.get(t.id);
      if (query.trim() && !match(v.task, v.type, v.client, v.ownerText, v.followup, v.contact, v.remark, v.meet))
        return false;
      return Object.entries(filters).every(([f, vals]) => !vals?.length || matchesField(v, f, vals));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayTasks, views, query, filters, hiddenRows, ranges]);

  // Row order: a dragged row keeps its sort_order; the rest follow the order
  // they were added in.
  const orderOf = useMemo(() => {
    const rank = new Map(
      [...tasks].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")).map((t, i) => [t.id, i * 1000])
    );
    return (t) => (t.sort_order ?? rank.get(t.id) ?? 0);
  }, [tasks]);

  const groups = useMemo(() => {
    const sortVal = (t) => {
      if (!sort) return orderOf(t);
      if (DATE_FIELD[sort.key]) return t[DATE_FIELD[sort.key]] || "";
      if (sort.key === "count") return t.deliverable_count ?? -1;
      return String(views.get(t.id)[sort.key === "owner" ? "ownerText" : sort.key] || "").toLowerCase();
    };
    const rows = [...visible].sort((a, b) => {
      const x = sortVal(a);
      const y = sortVal(b);
      const cmp = typeof x === "number" ? x - y : String(x).localeCompare(String(y));
      return sort?.dir === "desc" ? -cmp : cmp;
    });
    if (groupBy === "none") return [{ key: "all", name: "", rows }];
    const keyOf = (t) => {
      const v = views.get(t.id);
      if (groupBy === "owner") return v.owner || "Unassigned";
      if (groupBy === "client") return v.client || "Internal";
      return v.type || "No type";
    };
    const map = new Map();
    rows.forEach((t) => {
      const k = keyOf(t);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(t);
    });
    const last = new Set(["Unassigned", "Internal", "No type"]);
    return [...map.entries()]
      .sort(([a], [b]) => (last.has(a) ? 1 : last.has(b) ? -1 : a.localeCompare(b)))
      .map(([key, list]) => ({ key, name: key, rows: list }));
  }, [visible, views, sort, groupBy, orderOf]);

  useEffect(() => {
    if (didCollapseOnLoad.current || loading || groupBy === "none" || !groups.length) return;
    didCollapseOnLoad.current = true;
    setCollapsed(Object.fromEntries(groups.map((g) => [g.key, true])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, groups, groupBy]);

  // Rows in screen order (collapsed groups hidden) - for arrow keys and Shift+click.
  const flatRows = useMemo(
    () => groups.flatMap((g) => (collapsed[g.key] ? [] : g.rows)),
    [groups, collapsed]
  );

  return { activeUsers, noteFor, view, views, fieldValue, dayTasks, monthCount, visible, orderOf, groups, flatRows };
}
