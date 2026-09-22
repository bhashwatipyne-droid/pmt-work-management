// Generic Kanban board shell: owns horizontal scrolling and column layout
// only. Individual columns (and what's inside them) are passed as
// children, so this has no idea whether it's showing projects, approvals,
// or anything else added later.
//
// `maxHeight` bounds the board's own height and turns on a matching
// vertical scroll, so its horizontal scrollbar sits right at the bottom of
// that bounded box instead of at the true bottom of the tallest column's
// cards - which, with dozens or hundreds of cards in a column, could be
// many screens down and effectively undiscoverable. Omit it (the default)
// to keep the board's height unbounded, growing with the page as before.
export const KanbanBoard = ({
  children,
  minWidth = "1100px",
  maxHeight,
  className = "",
}) => {
  return (
    <div
      className={`pmt-hscroll overflow-x-scroll pb-4 ${maxHeight ? "overflow-y-auto" : ""} ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <div className="flex items-start gap-4" style={{ minWidth }}>
        {children}
      </div>
    </div>
  );
};