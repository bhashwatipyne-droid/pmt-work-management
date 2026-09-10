// Generic Kanban board shell: owns horizontal scrolling and column layout
// only. Individual columns (and what's inside them) are passed as
// children, so this has no idea whether it's showing projects, approvals,
// or anything else added later.
export const KanbanBoard = ({
  children,
  minWidth = "1100px",
  className = "",
}) => {
  return (
    <div className={`overflow-x-auto pb-4 ${className}`}>
      <div className="flex items-start gap-4" style={{ minWidth }}>
        {children}
      </div>
    </div>
  );
};