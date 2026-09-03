import { useRef, useState } from "react";
import { TableCell, TableRow } from "../ui/table";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { Checkbox } from "../ui/checkbox";
import { createWorksheetKeyHandler } from "./useWorksheetKeyboardNavigation";

const NONE = "__none__";
const STAGES = ["Content", "Design", "Animate", "Finish"];

const emptyDraft = (deliverableTypeDefault) => ({
  work_date: new Date().toISOString().slice(0, 10),
  project_id: null,
  deliverable_id: null,
  stage: null,
  deliverable_name: "",
  deliverable_link: "",
  deliverable_type: deliverableTypeDefault || "",
  work_category: "Core",
  version: "",
  time_taken_minutes: "",
  remarks: "",
  status: "Not Started",
});

export const DraftWorkSheetRow = ({ currentUser, users, options, projects = [], deliverables = [], onCreate }) => {
  const isMember = currentUser.role === "member";
  const isElevated = !isMember;
  const [draft, setDraft] = useState(() => {
    const d = emptyDraft(options.deliverable_types?.[0]);
    // hydrate sticky context
    d.project_id = localStorage.getItem("ws_last_project_id") || null;
    d.deliverable_id = localStorage.getItem("ws_last_deliverable_id") || null;
    d.stage = localStorage.getItem("ws_last_stage") || null;
    return d;
  });
  const creatingRef = useRef(false);

  const projDelivs = deliverables.filter((d) => d.project_id === draft.project_id);
  const allowedStatuses = isMember ? options.member_forward_statuses : options.statuses;

  const setField = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));

  const sheetCell = (col) => ({
    "data-sheet-cell": true,
    "data-sheet-row": 0,
    "data-sheet-col": col,
    onKeyDown: createWorksheetKeyHandler({
      row: 0,
      col,
      maxCol: 13,
    }),
  });

  const isMeaningful = (d) =>
    !!(d.deliverable_name?.trim() || d.deliverable_link?.trim() || d.remarks?.trim() || d.project_id || d.deliverable_id || d.stage || (d.time_taken_minutes && Number(d.time_taken_minutes) > 0) || d.version?.trim());

  const flush = async () => {
    if (creatingRef.current) return;
    if (!isMeaningful(draft)) return;
    creatingRef.current = true;
    try {
      // persist sticky context
      if (draft.project_id) localStorage.setItem("ws_last_project_id", draft.project_id);
      if (draft.deliverable_id) localStorage.setItem("ws_last_deliverable_id", draft.deliverable_id);
      if (draft.stage) localStorage.setItem("ws_last_stage", draft.stage);
      const payload = {
        ...draft,
        time_taken_minutes: draft.time_taken_minutes === "" ? 0 : Number(draft.time_taken_minutes),
      };
      await onCreate(payload);
      // reset for next entry
      setDraft(() => {
        const d = emptyDraft(options.deliverable_types?.[0]);
        d.project_id = localStorage.getItem("ws_last_project_id") || null;
        d.deliverable_id = localStorage.getItem("ws_last_deliverable_id") || null;
        d.stage = localStorage.getItem("ws_last_stage") || null;
        return d;
      });
    } finally {
      creatingRef.current = false;
    }
  };

  return (
    <TableRow data-testid="worksheet-draft-row">
      <TableCell className="row-num">+</TableCell>
      <TableCell className="checkbox-cell">
        <Checkbox disabled />
      </TableCell>
      <TableCell>
        <Input
          {...sheetCell(0)}
          data-testid="worksheet-draft-date"
          type="date"
          value={draft.work_date}
          onChange={(e) => setField("work_date", e.target.value)}
          onBlur={flush}
          className="h-8 w-[130px]"
        />
      </TableCell>
      <TableCell>
        <Select
          value={draft.project_id || NONE}
          onValueChange={(v) => {
            setField("project_id", v === NONE ? null : v);
            setField("deliverable_id", null);
            setTimeout(flush, 0);
          }}
        >
          <SelectTrigger
            {...sheetCell(1)}
            data-testid="worksheet-draft-project"
            className="h-8 w-[160px]"
          >
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={draft.deliverable_id || NONE}
          onValueChange={(v) => {
            setField("deliverable_id", v === NONE ? null : v);
            setTimeout(flush, 0);
          }}
          disabled={!draft.project_id}
        >
          <SelectTrigger
            {...sheetCell(2)}
            data-testid="worksheet-draft-deliverable"
            className="h-8 w-[160px]"
          >
            <SelectValue placeholder={draft.project_id ? "Deliverable" : "—"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {projDelivs.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={draft.stage || NONE}
          onValueChange={(v) => {
            setField("stage", v === NONE ? null : v);
            setTimeout(flush, 0);
          }}
        >
          <SelectTrigger
            {...sheetCell(3)}
            data-testid="worksheet-draft-stage"
            className="h-8 w-[110px]"
          >
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          {...sheetCell(4)}
          data-testid="worksheet-draft-deliverable-name"
          value={draft.deliverable_name}
          onChange={(e) => setField("deliverable_name", e.target.value)}
          onBlur={flush}
          placeholder="Start typing to add a row…"
          className="h-8 w-[200px]"
        />
      </TableCell>
      <TableCell>
        <Input
          {...sheetCell(5)}
          data-testid="worksheet-draft-deliverable-link"
          value={draft.deliverable_link}
          onChange={(e) => setField("deliverable_link", e.target.value)}
          onBlur={flush}
          placeholder="Paste drive link"
          className="h-8 w-[180px]"
        />
      </TableCell>
      <TableCell>
        <Select
          value={draft.deliverable_type || NONE}
          onValueChange={(v) => {
            setField("deliverable_type", v === NONE ? "" : v);
            setTimeout(flush, 0);
          }}
        >
          <SelectTrigger
            {...sheetCell(6)}
            data-testid="worksheet-draft-type"
            className="h-8 w-[220px]"
          >
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>—</SelectItem>
            {(options.deliverable_types || []).map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={draft.work_category}
          onValueChange={(v) => { setField("work_category", v); setTimeout(flush, 0); }}
        >
          <SelectTrigger
            {...sheetCell(7)}
            data-testid="worksheet-draft-category"
            className="h-8 w-[110px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(options.work_categories || []).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          {...sheetCell(8)}
          data-testid="worksheet-draft-version"
          value={draft.version}
          onChange={(e) => setField("version", e.target.value)}
          onBlur={flush}
          placeholder="v1"
          className="h-8 w-[80px]"
        />
      </TableCell>
      <TableCell>
        <Input
          {...sheetCell(9)}
          data-testid="worksheet-draft-time"
          type="number"
          min="0"
          value={draft.time_taken_minutes}
          onChange={(e) => setField("time_taken_minutes", e.target.value)}
          onBlur={flush}
          placeholder="0"
          className="h-8 w-[80px]"
        />
      </TableCell>
      <TableCell>
        <span className="cell-plain block">{isMember ? currentUser.name : (users.find((u) => u.id === draft.creator_id)?.name || currentUser.name)}</span>
      </TableCell>
      <TableCell><span className="cell-plain block text-slate-400">—</span></TableCell>
      <TableCell>
        <Textarea
          {...sheetCell(12)}
          data-testid="worksheet-draft-remarks"
          value={draft.remarks}
          onChange={(e) => setField("remarks", e.target.value)}
          onBlur={flush}
          placeholder="Notes…"
          className="h-8 min-h-8 w-[180px] resize-none"
          rows={1}
        />
      </TableCell>
      <TableCell>
        <Select
          value={draft.status}
          onValueChange={(v) => { setField("status", v); setTimeout(flush, 0); }}
        >
          <SelectTrigger
            {...sheetCell(13)}
            data-testid="worksheet-draft-status"
            className="h-8 w-[150px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowedStatuses?.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
};