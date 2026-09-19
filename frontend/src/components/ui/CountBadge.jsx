// Shared badge for "N pending items" counts — sidebar nav items and the
// Bulk Review button. Matches the reference spec: #EF4444 background,
// white text, 20-24px pill, and only ever renders when count > 0.
export const CountBadge = ({ count, className = "" }) => {
  if (!count || count <= 0) return null;

  return (
    <span
      className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#EF4444] px-1.5 text-[11px] font-bold leading-none text-white ${className}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
};