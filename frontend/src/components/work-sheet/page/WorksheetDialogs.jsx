import { AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";

export function WorksheetDialogs(ctx) {
  const { bulkDeleteConfirmOpen, confirmBulkDelete, deleteTarget, deleting, handleDelete, hideRowsErrorOpen, selectedIds, setBulkDeleteConfirmOpen, setDeleteTarget, setHideRowsErrorOpen } = ctx;
  return (
    <>
    <ConfirmDeleteModal
      open={!!deleteTarget}
      onClose={() => {
        if (!deleting) {
          setDeleteTarget(null);
        }
      }}
      onConfirm={() => handleDelete(deleteTarget)}
      title="Delete this work entry?"
      description="This work entry will be permanently removed."
      warning="This action cannot be undone."
      confirmLabel="Delete Entry"
      loading={deleting}
    />

    <ConfirmDeleteModal
      open={bulkDeleteConfirmOpen}
      onClose={() => {
        if (!deleting) {
          setBulkDeleteConfirmOpen(false);
        }
      }}
      onConfirm={confirmBulkDelete}
      title={`Delete ${selectedIds.length} selected row${
        selectedIds.length === 1 ? "" : "s"
      }?`}
      description={`These ${selectedIds.length} selected work entr${
        selectedIds.length === 1 ? "y" : "ies"
      } will be permanently removed.`}
      warning="This action cannot be undone."
      confirmLabel="Delete Rows"
      loading={deleting}
    />

    {hideRowsErrorOpen && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setHideRowsErrorOpen(false);
          }
        }}
      >
        <div
          className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hide-rows-error-title"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h2
                  id="hide-rows-error-title"
                  className="text-base font-semibold text-slate-900"
                >
                  Can't hide every row
                </h2>

                <button
                  type="button"
                  onClick={() => setHideRowsErrorOpen(false)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-2 text-sm leading-5 text-slate-600">
                At least one row needs to stay visible on the sheet.
                Unhide a row first if you want to hide this one.
              </p>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <Button
              type="button"
              onClick={() => setHideRowsErrorOpen(false)}
            >
              OK
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
