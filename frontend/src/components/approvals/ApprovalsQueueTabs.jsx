import { COLUMNS } from "@/components/approvals/approvalsView";

export function ApprovalsQueueTabs(ctx) {
  const { activeQueue, dragOverQueue, dragging, filteredBoard, handleMove, setActiveQueue, setDragOverQueue, setDragging } = ctx;
  return (
    <>
    {/* QUEUE TABS — also drop targets for drag-to-reassign */}
    <div
      role="tablist"
      aria-label="Approval queues"
      className="mt-3 flex gap-1 overflow-x-auto px-3 shadow-[inset_0_-1px_0_rgba(234,238,244,1)]"
    >
      {COLUMNS.map((column) => {
        const Icon = column.icon;
        const isActive = activeQueue === column.key;
        const isDropTarget = dragOverQueue === column.key && dragging?.approval_type !== column.key;

        return (
          <button
            key={column.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => setActiveQueue(column.key)}
            onDragOver={(e) => {
              if (!dragging || dragging.approval_type === column.key) return;
              e.preventDefault();
              setDragOverQueue(column.key);
            }}
            onDragLeave={() => setDragOverQueue((cur) => (cur === column.key ? null : cur))}
            onDrop={(e) => {
              e.preventDefault();
              setDragOverQueue(null);
              if (dragging) handleMove(dragging, column.key);
              setDragging(null);
            }}
            className={[
              "flex h-10 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-2.5 text-sm font-medium transition-colors",
              isActive
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
              isDropTarget ? "bg-[#f0f0fd]" : "",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" />
            {column.label}
            <span
              className={[
                "inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                isActive ? "bg-[#2b2bb5] text-white" : "bg-slate-100 text-slate-600",
              ].join(" ")}
            >
              {filteredBoard[column.key]?.length ?? 0}
            </span>
          </button>
        );
      })}
    </div>
    </>
  );
}
