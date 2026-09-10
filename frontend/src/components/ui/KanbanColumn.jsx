// Generic Kanban column shell. Knows nothing about projects, approvals,
// or any other domain — just how to render a column: header, count badge,
// optional description, a drop zone, and an empty state. The cards inside
// are passed as children.
export const KanbanColumn = ({
  title,
  count,
  icon: Icon,
  dotClassName,
  titleClassName = "text-foreground",
  description,
  children,
  empty,
  onDragOver,
  onDrop,
  isDropTarget = false,
  width = "320px",
  className = "",
}) => {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{ width, minWidth: width }}
      className={`flex shrink-0 flex-col rounded-xl border bg-[#f7f9fc] transition-colors ${
        isDropTarget ? "border-[#b8b8e8] bg-[#f3f3ff]" : "border-border"
      } ${className}`}
    >
      {/* Header */}
      <div className="border-b border-border bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {dotClassName && (
              <span className={`h-2 w-2 shrink-0 rounded-full ${dotClassName}`} />
            )}

            {Icon && <Icon className="h-4 w-4 shrink-0 text-[#2b2bb5]" />}

            <span className={`truncate text-sm font-semibold ${titleClassName}`}>
              {title}
            </span>
          </div>

          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            {count}
          </span>
        </div>

        {description && (
          <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Cards */}
      <div className="flex min-h-[560px] flex-1 flex-col gap-3 p-3">
        {children}

        {empty && (
          <div className="flex min-h-[180px] flex-1 items-center justify-center rounded-lg border border-dashed border-border bg-white/60 px-4 text-center">
            <p className="text-xs text-muted-foreground">{empty}</p>
          </div>
        )}
      </div>
    </div>
  );
};