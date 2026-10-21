import { APPROVALS } from "@/constants/testIds";
import { ApprovalRow } from "@/components/approvals/ApprovalRow";

export function ApprovalsList(ctx) {
  const { aList, allInQueueSelected, canAct, detailOpen, endDrag, loading, movingId, openRow, selectedId, selectedIds, startDrag, toggleSelect, toggleSelectAllInQueue } = ctx;
  return (
    <>
    {/* LIST */}
    <div className={`flex w-full shrink-0 flex-col border-r border-slate-200 md:w-[360px] ${detailOpen ? "max-md:hidden" : ""}`}>
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-slate-200 px-4">
        {canAct && (
          <input
            type="checkbox"
            aria-label="Select all in this queue"
            checked={allInQueueSelected}
            onChange={toggleSelectAllInQueue}
            disabled={aList.length === 0}
            className="h-4 w-4 rounded border-slate-300 text-[#2b2bb5] accent-[#2b2bb5]"
          />
        )}
        <span className="text-xs text-slate-500">
          {aList.length} pending
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : aList.length === 0 ? (
          <div
            data-testid={APPROVALS.emptyState}
            className="flex flex-col items-center gap-1.5 px-5 py-10 text-center"
          >
            <span className="text-sm font-semibold text-foreground">No pending approvals</span>
            <span className="text-xs text-muted-foreground">This queue is clear.</span>
          </div>
        ) : (
          aList.map((item) => (
            <ApprovalRow
              key={item.id}
              item={item}
              isSelected={item.id === selectedId}
              checked={selectedIds.has(item.id)}
              canAct={canAct}
              draggable={canAct && !movingId}
              onOpen={openRow}
              onToggle={toggleSelect}
              onDragStart={startDrag}
              onDragEnd={endDrag}
            />
          ))
        )}
      </div>
    </div>
    </>
  );
}
