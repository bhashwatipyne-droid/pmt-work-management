
export function GridEmpty(ctx) {
  const { allDays, canEdit, clearFilters, control, dayTasks, loading, visible } = ctx;
  return (
    <>
    {!loading && !visible.length && (
      <div
        className="sticky left-0 flex flex-col items-center gap-2 px-5 py-12 text-center"
        style={{ width: "min(100vw, 720px)" }}
      >
        {dayTasks.length ? (
          <>
            <span className="text-[14px] font-semibold text-[#0d1b3e]">No rows match</span>
            <span className="text-[13px] text-[#546490]">Try a different search or clear filters.</span>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-1 h-8 rounded-[7px] bg-[#f5f6f8] px-3.5 text-[13px] font-semibold text-[#4a5878] hover:bg-[#eef0f3]"
              style={control}
            >
              Clear filters
            </button>
          </>
        ) : (
          <>
            <span className="text-[14px] font-semibold text-[#0d1b3e]">
              {allDays ? "No tasks this month" : "No tasks open on this day"}
            </span>
            <span className="text-[13px] text-[#546490]">
              {canEdit ? "Use Add row to start one." : "Pick another day or month."}
            </span>
          </>
        )}
      </div>
    )}
    </>
  );
}
