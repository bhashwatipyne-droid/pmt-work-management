import { useEffect, useState } from "react";
import { X, Search } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

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

const MultiSelect = ({
  label,
  values,
  selected,
  onChange,
}) => {
  const [search, setSearch] = useState("");

  const filtered = values.filter((value) =>
    value.label.toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (value) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-slate-700">
        {label}
      </div>

      {values.length > 6 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}...`}
            className="h-8 pl-8 text-xs"
          />
        </div>
      )}

      <div className="max-h-36 space-y-1 overflow-y-auto">
        {filtered.map((value) => (
          <label
            key={value.value}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50"
          >
            <input
              type="checkbox"
              checked={selected.includes(value.value)}
              onChange={() => toggle(value.value)}
            />

            <span className="truncate">
              {value.label}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
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

  if (!open) return null;

  const update = (key, value) => {
    setDraft((current) => ({
      ...current,
      [key]: value,
    }));
  };

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

      <div className="absolute right-4 top-20 flex w-[380px] max-h-[calc(100vh-110px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
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

        <div className="flex-1 space-y-6 overflow-y-auto p-5">

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
          <MultiSelect
            label="Project"
            values={projects.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
            selected={draft.project_ids || []}
            onChange={(value) =>
              update("project_ids", value)
            }
          />

          {/* DELIVERABLE */}
          <MultiSelect
            label="Deliverable"
            values={deliverables.map((d) => ({
              value: d.id,
              label: d.name,
            }))}
            selected={draft.deliverable_ids || []}
            onChange={(value) =>
              update("deliverable_ids", value)
            }
          />

          {/* STAGE */}
          <MultiSelect
            label="Stage"
            values={(options.stages || []).map((s) => ({
              value: s,
              label: s,
            }))}
            selected={draft.stages || []}
            onChange={(value) =>
              update("stages", value)
            }
          />

          {/* TYPE */}
          <MultiSelect
            label="Deliverable Type"
            values={(options.deliverable_types || []).map((t) => ({
              value: t,
              label: t,
            }))}
            selected={draft.deliverable_types || []}
            onChange={(value) =>
              update("deliverable_types", value)
            }
          />

          {/* CATEGORY */}
          <MultiSelect
            label="Category"
            values={(options.work_categories || []).map((c) => ({
              value: c,
              label: c,
            }))}
            selected={draft.work_categories || []}
            onChange={(value) =>
              update("work_categories", value)
            }
          />

          {/* CREATOR */}
          <MultiSelect
            label="Creator"
            values={users
              .filter((u) => u.role !== "admin")
              .map((u) => ({
                value: u.id,
                label: u.name,
              }))}
            selected={draft.creator_ids || []}
            onChange={(value) =>
              update("creator_ids", value)
            }
          />

          {/* REVIEWER */}
          <MultiSelect
            label="Reviewer"
            values={users
              .filter((u) => u.role !== "member")
              .map((u) => ({
                value: u.id,
                label: u.name,
              }))}
            selected={draft.reviewer_ids || []}
            onChange={(value) =>
              update("reviewer_ids", value)
            }
          />

          {/* STATUS */}
          <MultiSelect
            label="Status"
            values={(options.statuses || []).map((s) => ({
              value: s,
              label: s,
            }))}
            selected={draft.statuses || []}
            onChange={(value) =>
              update("statuses", value)
            }
          />
        </div>

        <div className="flex items-center justify-between border-t bg-slate-50 px-5 py-3">
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