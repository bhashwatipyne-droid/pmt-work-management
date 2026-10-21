import ConfirmDeleteModal from "@/components/ui/ConfirmDeleteModal";
import { WorkSheetHistory } from "@/components/work-sheet/WorkSheetHistory";
import { getProjectTaskHistory } from "@/services/api";

export function SheetDialogs(ctx) {
  const { bulkDelete, confirmDelete, deleting, historyOpen, selIds, setConfirmDelete, setHistoryOpen } = ctx;
  return (
    <>
    <WorkSheetHistory
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
      stage="Projects"
      load={getProjectTaskHistory}
      subtitle="Management sheet"
    />

    <ConfirmDeleteModal
      open={confirmDelete}
      onClose={() => !deleting && setConfirmDelete(false)}
      onConfirm={bulkDelete}
      title={`Delete ${selIds.length} selected row${selIds.length === 1 ? "" : "s"}?`}
      description="These tasks and their remarks will be permanently removed."
      warning="This action cannot be undone."
      confirmLabel="Delete Rows"
      loading={deleting}
    />
    </>
  );
}
