import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";

export default function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  title = "Delete this item?",
  description = "This action cannot be undone.",
  warning,
  confirmLabel = "Delete",
  loading = false,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>

          <div className="min-w-0">
            <h2
              id="confirm-delete-title"
              className="text-base font-semibold text-slate-900"
            >
              {title}
            </h2>

            <p className="mt-2 text-sm leading-5 text-slate-600">
              {description}
            </p>

            {warning && (
              <div className="mt-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm leading-5 text-red-700">
                {warning}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {loading ? "Deleting..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}