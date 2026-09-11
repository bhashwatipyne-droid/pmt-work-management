import { Eye, EyeOff, Trash2, X } from "lucide-react";

export const ProjectBulkActionBar = ({
  selectedCount,
  totalCount,
  visibility,
  onSelectAll,
  onHide,
  onUnhide,
  onDelete,
  onClear,
}) => {
  if (selectedCount === 0) return null;

  const allSelected = selectedCount === totalCount;

  return (
    <div className="mb-4 flex min-h-[56px] items-center justify-between rounded-xl border border-[#d9d9f5] bg-[#f5f5ff] px-4 py-2.5">
      <div className="flex items-center gap-4">
        <span className="text-sm font-medium text-[#1a1a8a]">
          {selectedCount} project{selectedCount === 1 ? "" : "s"} selected
        </span>

        {!allSelected && totalCount > 0 && (
          <>
            <span className="h-5 w-px bg-[#d9d9f5]" />

            <button
              type="button"
              onClick={onSelectAll}
              className="text-xs font-semibold text-[#2b2bb5] hover:underline"
            >
              Select all {totalCount} projects
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        {visibility === "hidden" ? (
          <button
            type="button"
            onClick={onUnhide}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#2b2bb5] bg-white px-3 text-sm font-medium text-[#2b2bb5] hover:bg-[#f0f0fd]"
          >
            <Eye className="h-4 w-4" />
            Unhide
          </button>
        ) : (
          <button
            type="button"
            onClick={onHide}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#2b2bb5] bg-white px-3 text-sm font-medium text-[#2b2bb5] hover:bg-[#f0f0fd]"
          >
            <EyeOff className="h-4 w-4" />
            Hide
          </button>
        )}

        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>

        <button
          type="button"
          onClick={onClear}
          className="ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-700"
          aria-label="Clear selection"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};