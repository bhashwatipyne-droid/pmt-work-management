import { BulkActionBar } from "@/components/work-sheet/BulkActionBar";
import { QuickLogTrigger } from "@/components/work-sheet/QuickLogTrigger";
import { Suspense, lazy } from "react";
import { WorkSheetHistory } from "@/components/work-sheet/WorkSheetHistory";

// Lazy — closed by default, so its code only downloads once someone actually
// opens it, instead of padding out the Work Sheet page's own initial chunk.
const QuickLoggerModal = lazy(() => import("@/components/work-sheet/QuickLoggerModal"));

export function WorksheetOverlays(ctx) {
  const { activeSheet, bulkCollabPeople, clients, currentUser, deliverables, handleAddCollaborators, handleBulkAssign, handleBulkDelete, handleBulkDuplicate, handleBulkStatus, handleHideRows, handleInsertRow, handleQuickLoggerSave, historyOpen, isAdmin, isManager, isMember, options, projects, quickLoggerOpen, selectedIds, setHistoryOpen, setQuickLoggerOpen, setSelectedIds } = ctx;
  return (
    <>
    {(isManager || isMember) && (
      <QuickLogTrigger onOpen={() => setQuickLoggerOpen(true)} />
    )}

    <Suspense fallback={null}>
      <QuickLoggerModal
        open={quickLoggerOpen}
        onClose={() => setQuickLoggerOpen(false)}
        currentUser={currentUser}
        projects={projects}
        deliverables={deliverables}
        clients={clients}
        options={options}
        onSave={handleQuickLoggerSave}
      />
    </Suspense>

    <WorkSheetHistory
      open={historyOpen}
      onClose={() => setHistoryOpen(false)}
      stage={activeSheet}
    />

    {selectedIds.length > 0 && (
      <BulkActionBar
        selectedCount={selectedIds.length}
        currentUser={currentUser}
        options={options}
        projects={projects}
        deliverables={deliverables}
        onApplyStatus={handleBulkStatus}
        onApplyAssign={handleBulkAssign}
        collabPeople={bulkCollabPeople}
        onAddCollaborators={
          isAdmin ? undefined : (creatorIds) => handleAddCollaborators(selectedIds, creatorIds)
        }
        onHideRows={handleHideRows}
        // Admins edit and delete rows but cannot create them, so the buttons
        // that add rows are not offered.
        onInsertAbove={isAdmin ? undefined : () => handleInsertRow("above")}
        onInsertBelow={isAdmin ? undefined : () => handleInsertRow("below")}
        onDuplicate={isAdmin ? undefined : handleBulkDuplicate}
        onDelete={handleBulkDelete}
        onClear={() => setSelectedIds([])}
      />
    )}
    </>
  );
}
