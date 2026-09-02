import { useEffect, useState } from "react";
import { TableCell, TableRow } from "../ui/table";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { StatusBadge } from "./StatusBadge";
import { WORKSHEET } from "@/constants/testIds";
import { canEditWorkItem } from "@/lib/worksheetPermissions";

const NONE_VALUE = "__none__";
const STAGES = ["Content", "Design", "Animate", "Finish"];

export const WorkSheetRow = ({ item, index, currentUser, users, options, projects = [], deliverables = [], onUpdate, selected, onToggleSelect }) => {
  const isMember = currentUser.role === "member";
  const isElevated = !isMember;
  const canEditRow = canEditWorkItem(currentUser, item, users);
  const canEditExtra = isElevated && canEditRow;
  const [local, setLocal] = useState({
    deliverable_name: item.deliverable_name,
    deliverable_link: item.deliverable_link,
    version: item.version,
    time_taken_minutes: item.time_taken_minutes,
    remarks: item.remarks,
  });

  useEffect(() => {
    setLocal({
      deliverable_name: item.deliverable_name,
      deliverable_link: item.deliverable_link,
      version: item.version,
      time_taken_minutes: item.time_taken_minutes,
      remarks: item.remarks,
    });
  }, [item.updated_at]);

  const nameOf = (id) => users.find((u) => u.id === id)?.name || "Unassigned";
  const allowedStatuses = isMember ? options.member_forward_statuses : options.statuses;
  const projectDeliverables = deliverables.filter((d) => d.project_id === item.project_id);

  const commit = (field, value) => {
    if (item[field] === value) return;
    onUpdate(item.id, { [field]: value });
  };

  return (
    <TableRow data-testid={`worksheet-row-${item.id}`}>
      <TableCell className="row-num">{index}</TableCell>
      <TableCell className="checkbox-cell">
        <Checkbox
          data-testid={`worksheet-row-checkbox-${item.id}`}
          checked={selected}
          disabled={!canEditRow}
          onCheckedChange={() => onToggleSelect(item.id)}
        />
      </TableCell>
      <TableCell>
        <Input
          data-testid={`${WORKSHEET.dateInput}-${item.id}`}
          type="date"
          value={item.work_date}
          disabled={!canEditRow}
          onChange={(e) => onUpdate(item.id, { work_date: e.target.value })}
          className="h-8 w-[130px]"
        />
      </TableCell>
      <TableCell>
        <Select
          value={item.project_id || NONE_VALUE}
          onValueChange={(v) => {
            const nextId = v === NONE_VALUE ? null : v;
            const patch = { project_id: nextId };
            // clear deliverable if switching project
            if (nextId !== item.project_id) patch.deliverable_id = null;
            onUpdate(item.id, patch);
          }}
          disabled={!canEditRow}
        >
          <SelectTrigger data-testid={`worksheet-project-select-${item.id}`} className="h-8 w-[160px]">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>—</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={item.deliverable_id || NONE_VALUE}
          onValueChange={(v) => onUpdate(item.id, { deliverable_id: v === NONE_VALUE ? null : v })}
          disabled={!canEditRow || !item.project_id}
        >
          <SelectTrigger data-testid={`worksheet-deliverable-select-${item.id}`} className="h-8 w-[160px]">
            <SelectValue placeholder={item.project_id ? "Deliverable" : "—"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>—</SelectItem>
            {projectDeliverables.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={item.stage || NONE_VALUE}
          onValueChange={(v) => onUpdate(item.id, { stage: v === NONE_VALUE ? null : v })}
          disabled={!canEditRow}
        >
          <SelectTrigger data-testid={`worksheet-stage-select-${item.id}`} className="h-8 w-[110px]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>—</SelectItem>
            {STAGES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {canEditExtra ? (
          <Input
            data-testid={`${WORKSHEET.deliverableInput}-${item.id}`}
            value={local.deliverable_name}
            onChange={(e) => setLocal((l) => ({ ...l, deliverable_name: e.target.value }))}
            onBlur={() => commit("deliverable_name", local.deliverable_name)}
            className="h-8 w-[180px]"
            placeholder="Deliverable name"
          />
        ) : (
          <span className="cell-plain block">{item.deliverable_name || "—"}</span>
        )}
      </TableCell>
      <TableCell>
        {canEditRow ? (
          <Input
            data-testid={`${WORKSHEET.deliverableLinkInput}-${item.id}`}
            value={local.deliverable_link}
            onChange={(e) => setLocal((l) => ({ ...l, deliverable_link: e.target.value }))}
            onBlur={() => commit("deliverable_link", local.deliverable_link)}
            className="h-8 w-[180px]"
            placeholder="Paste drive link"
          />
        ) : item.deliverable_link ? (
          <a href={item.deliverable_link} target="_blank" rel="noreferrer" className="cell-plain block truncate text-indigo-600 underline">
            {item.deliverable_link}
          </a>
        ) : (
          <span className="cell-plain block">—</span>
        )}
      </TableCell>
      <TableCell>
        {canEditExtra ? (
          <Select value={item.deliverable_type || undefined} onValueChange={(v) => onUpdate(item.id, { deliverable_type: v })}>
            <SelectTrigger data-testid={`${WORKSHEET.typeSelect}-${item.id}`} className="h-8 w-[150px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              {options.deliverable_types?.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="cell-plain block">{item.deliverable_type || "—"}</span>
        )}
      </TableCell>
      <TableCell>
        {canEditExtra ? (
          <Select value={item.work_category} onValueChange={(v) => onUpdate(item.id, { work_category: v })}>
            <SelectTrigger data-testid={`${WORKSHEET.categorySelect}-${item.id}`} className="h-8 w-[110px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.work_categories?.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="cell-plain block">{item.work_category}</span>
        )}
      </TableCell>
      <TableCell>
        <Input
          data-testid={`${WORKSHEET.versionInput}-${item.id}`}
          value={local.version}
          disabled={!canEditRow}
          onChange={(e) => setLocal((l) => ({ ...l, version: e.target.value }))}
          onBlur={() => commit("version", local.version)}
          className="h-8 w-[80px]"
          placeholder="v1"
        />
      </TableCell>
      <TableCell>
        <Input
          data-testid={`${WORKSHEET.timeInput}-${item.id}`}
          type="number"
          min="0"
          step="5"
          value={local.time_taken_minutes}
          disabled={!canEditRow}
          onChange={(e) => setLocal((l) => ({ ...l, time_taken_minutes: e.target.value }))}
          onBlur={() => commit("time_taken_minutes", Number(local.time_taken_minutes) || 0)}
          className="h-8 w-[80px]"
        />
      </TableCell>
      <TableCell>
        {canEditExtra ? (
          <Select value={item.creator_id || undefined} onValueChange={(v) => onUpdate(item.id, { creator_id: v })}>
            <SelectTrigger data-testid={`${WORKSHEET.creatorSelect}-${item.id}`} className="h-8 w-[140px]">
              <SelectValue placeholder="Creator" />
            </SelectTrigger>
            <SelectContent>
              {users.filter((u) => u.role !== "admin").map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="cell-plain block">{nameOf(item.creator_id)}</span>
        )}
      </TableCell>
      <TableCell>
        {canEditExtra ? (
          <Select
            value={item.reviewer_id || NONE_VALUE}
            onValueChange={(v) => onUpdate(item.id, { reviewer_id: v === NONE_VALUE ? null : v })}
          >
            <SelectTrigger data-testid={`${WORKSHEET.reviewerSelect}-${item.id}`} className="h-8 w-[140px]">
              <SelectValue placeholder="Reviewer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>Unassigned</SelectItem>
              {users.filter((u) => u.role !== "member").map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="cell-plain block">{item.reviewer_id ? nameOf(item.reviewer_id) : "Unassigned"}</span>
        )}
      </TableCell>
      <TableCell>
        <Textarea
          data-testid={`${WORKSHEET.remarksInput}-${item.id}`}
          value={local.remarks}
          disabled={!canEditRow}
          onChange={(e) => setLocal((l) => ({ ...l, remarks: e.target.value }))}
          onBlur={() => commit("remarks", local.remarks)}
          className="min-h-[32px] h-8 w-[200px] resize-none py-1.5"
          rows={1}
        />
      </TableCell>
      <TableCell>
        <Select value={item.status} onValueChange={(v) => onUpdate(item.id, { status: v })} disabled={!canEditRow}>
          <SelectTrigger data-testid={`${WORKSHEET.statusSelect}-${item.id}`} className="h-8 w-[170px] border-none bg-transparent shadow-none p-0">
            <SelectValue>
              <StatusBadge status={item.status} />
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.statuses?.map((s) => (
              <SelectItem key={s} value={s} disabled={!allowedStatuses?.includes(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
};
