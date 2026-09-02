import { StatusBadge } from "../work-sheet/StatusBadge";
import { DASHBOARD } from "@/constants/testIds";

export const AttentionPanel = ({ items }) => (
  <div data-testid={DASHBOARD.attentionPanel} className="rounded-xl border border-border bg-card">
    <div className="border-b border-border px-4 py-3">
      <h3 className="text-sm font-semibold text-foreground">Needs Attention</h3>
      <p className="text-xs text-muted-foreground">Awaiting review or rework, oldest first</p>
    </div>
    {items.length === 0 ? (
      <p data-testid={DASHBOARD.attentionEmpty} className="px-4 py-8 text-center text-sm text-muted-foreground">
        Nothing needs attention right now.
      </p>
    ) : (
      <ul className="divide-y divide-border">
        {items.map((it) => (
          <li key={it.id} data-testid={`${DASHBOARD.attentionItemPrefix}-${it.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{it.deliverable_name || "Untitled deliverable"}</p>
              <p className="text-xs text-muted-foreground">{it.creator_name} · {it.work_date}</p>
            </div>
            <StatusBadge status={it.status} />
          </li>
        ))}
      </ul>
    )}
  </div>
);
