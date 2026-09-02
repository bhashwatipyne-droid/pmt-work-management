import { StatusBadge } from "../work-sheet/StatusBadge";
import { DASHBOARD } from "@/constants/testIds";

export const StatusBreakdown = ({ statusCounts }) => (
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
    {Object.entries(statusCounts || {}).map(([status, count]) => (
      <div
        key={status}
        data-testid={`${DASHBOARD.statusTilePrefix}-${status.toLowerCase().replace(/\s+/g, "-")}`}
        className="rounded-lg border border-border bg-card p-3"
      >
        <div className="text-2xl font-bold text-foreground">{count}</div>
        <div className="mt-1">
          <StatusBadge status={status} />
        </div>
      </div>
    ))}
  </div>
);
