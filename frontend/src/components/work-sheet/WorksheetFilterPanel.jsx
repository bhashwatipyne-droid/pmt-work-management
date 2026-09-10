import { useCallback, useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { FilterMultiSelect } from "./FilterMultiSelect";

const EMPTY = {
  search: "",
  status: "",
  deliverable_type: "",
  work_category: "",
  month: "",
  date_from: "",
  date_to: "",
  project_ids: [],
  deliverable_ids: [],
  stages: [],
  deliverable_types: [],
  work_categories: [],
  creator_ids: [],
  reviewer_ids: [],
  statuses: [],
};

export const WorksheetFilterPanel = ({
  open,
  onClose,
  filters,
  setFilters,
  options,
  projects = [],
  deliverables = [],
  users = [],
}) => {
  const [draft, setDraft] = useState(filters);

  useEffect(() => {
    if (open) {
      setDraft(filters);
    }
  }, [open, filters]);

  // Each of these is recomputed only when the underlying data actually
  // changes (projects/deliverables/options/users) — NOT on every draft
  // edit. Previously these were built inline as `projects.map(...)` on
  // every render, which handed every FilterMultiSelect a brand-new array
  // reference on every keystroke/checkbox click, defeating memoization
  // and making every checkbox in the panel re-render, not just the one
  // that changed. That's what caused the multi-second lag on a single
  // tick.
  const projectValues = useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })),
    [projects]
  );
  const deliverableValues = useMemo(
    () => deliverables.map((d) => ({ value: d.id, label: d.name })),
    [deliverables]
  );
  const stageValues = useMemo(
    () => (options.stages || []).map((s) => ({ value: s, label: s })),
    [options.stages]
  );
  const typeValues = useMemo(
    () => (options.deliverable_types || []).map((t) => ({ value: t, label: t })),
    [options.deliverable_types]
  );
  const categoryValues = useMemo(
    () => (options.work_categories || []).map((c) => ({ value: c, label: c })),
    [options.work_categories]
  );
  const creatorValues = useMemo(
    () =>
      users
        .filter((u) => u.role !== "admin")
        .map((u) => ({ value: u.id, label: u.name })),
    [users]
  );
  const reviewerValues = useMemo(
    () =>
      users
        .filter((u) => u.role !== "member")
        .map((u) => ({ value: u.id, label: u.name })),
    [users]
  );
  const statusValues = useMemo(
    () => (options.statuses || []).map((s) => ({ value: s, label: s })),
    [options.statuses]
  );

  if (!open) return null;

  const update = (key, value) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

  // Stable across every render (setDraft's identity from useState never
  // changes) — passed as-is to every FilterMultiSelect below so
  // React.memo can actually tell "nothing relevant to me changed" and
  // skip re-rendering the other seven lists when only one checkbox in
  // one of them was clicked.
  const updateField = useCallback((key, value) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  }, []);

  const clearAll = () => {
    setDraft({
      ...EMPTY,
    });
  };

  const apply = () => {
    setFilters(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
        aria-label="Close filters"
      />

      <div className="absolute right-4 top-20 flex max-h-[calc(100vh-110px)] w-[380px] flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
        <div className="flex items-center justify-between border-b px-4 py-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Filters
            </h2>

            <p className="mt-0.5 text-xs text-slate-500">
              Filter the worksheet
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-4">

          {/* DATE */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-700">
              Date range
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[11px] text-slate-500">
                  From
                </label>

                <Input
                  type="date"
                  value={draft.date_from || ""}
                  onChange={(e) =>
                    update("date_from", e.target.value)
                  }
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] text-slate-500">
                  To
                </label>

                <Input
                  type="date"
                  value={draft.date_to || ""}
                  onChange={(e) =>
                    update("date_to", e.target.value)
                  }
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>

          {/* PROJECT */}
          <FilterMultiSelect
            label="Project"
            filterKey="project_ids"
            values={projectValues}
            selected={draft.project_ids || []}
            onChange={updateField}
          />

          {/* DELIVERABLE */}
          <FilterMultiSelect
            label="Deliverable"
            filterKey="deliverable_ids"
            values={deliverableValues}
            selected={draft.deliverable_ids || []}
            onChange={updateField}
          />

          {/* STAGE */}
          <FilterMultiSelect
            label="Stage"
            filterKey="stages"
            values={stageValues}
            selected={draft.stages || []}
            onChange={updateField}
          />

          {/* TYPE */}
          <FilterMultiSelect
            label="Deliverable Type"
            filterKey="deliverable_types"
            values={typeValues}
            selected={draft.deliverable_types || []}
            onChange={updateField}
          />

          {/* CATEGORY */}
          <FilterMultiSelect
            label="Category"
            filterKey="work_categories"
            values={categoryValues}
            selected={draft.work_categories || []}
            onChange={updateField}
          />

          {/* CREATOR */}
          <FilterMultiSelect
            label="Creator"
            filterKey="creator_ids"
            values={creatorValues}
            selected={draft.creator_ids || []}
            onChange={updateField}
          />

          {/* REVIEWER */}
          <FilterMultiSelect
            label="Reviewer"
            filterKey="reviewer_ids"
            values={reviewerValues}
            selected={draft.reviewer_ids || []}
            onChange={updateField}
          />

          {/* STATUS */}
          <FilterMultiSelect
            label="Status"
            filterKey="statuses"
            values={statusValues}
            selected={draft.statuses || []}
            onChange={updateField}
          />
        </div>

        <div className="flex items-center justify-between border-t bg-slate-50 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAll}
          >
            Clear all
          </Button>

          <Button
            size="sm"
            onClick={apply}
          >
            Apply Filters
          </Button>
        </div>
      </div>
    </div>
  );
};