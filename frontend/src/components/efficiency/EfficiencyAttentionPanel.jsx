import { Link } from "react-router-dom";
import { AlertTriangle, Settings2 } from "lucide-react";

const Row = ({ tone = "amber", children, action }) => {
  const tones = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
  };

  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm ${tones[tone]}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 opacity-70" />
        <span>{children}</span>
      </div>
      {action}
    </div>
  );
};

export const EfficiencyAttentionPanel = ({ attention }) => {
  if (!attention) return null;

  const {
    missing_capacity = [],
    excessive_non_core = [],
    no_closed_deliverables = [],
    missing_activity_targets = [],
    no_active_targets,
  } = attention;

  const nothing =
    !missing_capacity.length &&
    !excessive_non_core.length &&
    !no_closed_deliverables.length &&
    !missing_activity_targets.length &&
    !no_active_targets;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-800">Attention needed</h3>
        <p className="text-xs text-slate-500">Data gaps that affect the numbers above</p>
      </div>

      <div className="flex flex-col gap-2 p-4">
        {nothing && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            Everything is configured for this month.
          </div>
        )}

        {no_active_targets && (
          <Row tone="rose"
            action={
              <Link
                to="/efficiency/settings/activity-targets"
                className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-xs font-semibold"
              >
                <Settings2 className="h-3 w-3" />
                Configure
              </Link>
            }
          >
            No active core activity targets. Productivity cannot be calculated until targets are set.
          </Row>
        )}

        {missing_capacity.length > 0 && (
          <Row
            action={
              <Link
                to="/efficiency/settings/monthly-capacity"
                className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-white/70 px-2 py-1 text-xs font-semibold"
              >
                <Settings2 className="h-3 w-3" />
                Set up
              </Link>
            }
          >
            {missing_capacity.length} employee{missing_capacity.length > 1 ? "s have" : " has"} no
            monthly capacity setup: {missing_capacity.map((m) => m.name).join(", ")}
          </Row>
        )}

        {excessive_non_core.length > 0 && (
          <Row>
            {excessive_non_core.length} employee
            {excessive_non_core.length > 1 ? "s have" : " has"} unusually high non-core hours:{" "}
            {excessive_non_core.map((m) => `${m.name} (${m.non_core_hours}h)`).join(", ")}
          </Row>
        )}

        {no_closed_deliverables.length > 0 && (
          <Row>
            No closed core deliverables for:{" "}
            {no_closed_deliverables.map((m) => m.name).join(", ")}
          </Row>
        )}

        {missing_activity_targets.length > 0 && (
          <Row>
            {missing_activity_targets.length} active activit
            {missing_activity_targets.length > 1 ? "ies have" : "y has"} no daily potential set:{" "}
            {missing_activity_targets.slice(0, 4).join(", ")}
            {missing_activity_targets.length > 4 ? "…" : ""}
          </Row>
        )}
      </div>
    </div>
  );
};