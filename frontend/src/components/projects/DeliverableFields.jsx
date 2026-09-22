import { FileText, Pencil, Play, Users, CalendarDays } from "lucide-react";
import { SelectPill } from "@/components/ui/SelectPill";
import { DatePill } from "@/components/ui/DatePill";
import { MultiSelectPill } from "@/components/ui/MultiSelectPill";
import { STAGES } from "@/constants/projectPalette";

const STAGE_ICONS = {
  Content: FileText,
  Design: Pencil,
  Animate: Play,
};

// A deliverable's overall start/end date is always DERIVED from these
// per-stage windows (earliest stage start, latest stage end) - it is never
// entered directly, here or anywhere else. A stage with no window simply
// isn't tracked for deadlines yet; that's fine, dates are optional per stage.
//
// Validates a stage_schedule object the same way the backend does
// (normalize_stage_schedule in backend/server.py), so a bad range is caught
// before the request round-trip. Returns an error message, or null when
// everything is fine.
export const validateStageSchedule = (requiredStages, stageSchedule = {}) => {
  for (const stage of requiredStages || []) {
    const window = stageSchedule[stage];
    if (!window) continue;
    const { start_dt: start, end_dt: end } = window;
    if (!start && !end) continue;
    if (!start || !end) {
      return `Both a start and end date are needed for the ${stage} stage.`;
    }
    if (end < start) {
      return `The ${stage} stage's end date must be on or after its start date.`;
    }
  }
  return null;
};

const setStageDate = (stageSchedule, stage, edge, value) => {
  const next = { ...(stageSchedule || {}) };
  const window = { ...(next[stage] || {}) };
  window[edge] = value || "";
  next[stage] = window;
  return next;
};

// One stage's start/end pair. `size` swaps between the compact inline layout
// (CreateProjectModal's small card) and the larger standalone layout.
const StageDateRow = ({ stage, window, onChange, disabled, size }) => {
  const small = size === "sm";
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${small ? "" : "rounded-lg bg-slate-50 px-3 py-2"}`}
    >
      {!small && (
        <span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">
          {stage}
        </span>
      )}

      <DatePill
        icon={CalendarDays}
        value={window?.start_dt || ""}
        onChange={(next) => onChange(stage, "start_dt", next)}
        placeholder={small ? `${stage} start` : "Start"}
        triggerTestId={`deliverable-stage-start-${stage}`}
      />

      <span className="text-xs text-muted-foreground">→</span>

      <DatePill
        icon={CalendarDays}
        value={window?.end_dt || ""}
        onChange={(next) => onChange(stage, "end_dt", next)}
        placeholder={small ? `${stage} end` : "End"}
        triggerTestId={`deliverable-stage-end-${stage}`}
      />
    </div>
  );
};

// Just the form fields for a deliverable — name, type, per-stage deadline
// windows, and production stages. No modal chrome, no save/cancel buttons,
// no API calls. Used both inside the standalone DeliverableModal and inline
// in CreateProjectModal's "Create deliverable" card, so the two never
// drift apart visually.
//
// `compact` swaps the large heading-style name field and the
// always-visible stage picker for a smaller name field and a single
// stages pill (checkboxes in a popover) — meant for the inline card in
// CreateProjectModal, which needs to stay small since it lives inside
// an already-busy form. The standalone DeliverableModal keeps the
// larger, always-visible layout (compact=false, the default).
export const DeliverableFields = ({
  deliverable,
  onChange,
  onToggleStage,
  deliverableTypes = [],
  disabled = false,
  autoFocusName = true,
  compact = false,
}) => {
  const selectedStages = STAGES.filter((stage) =>
    (deliverable.required_stages || []).includes(stage)
  );

  const stageSchedule = deliverable.stage_schedule || {};

  const changeStageDate = (stage, edge, value) => {
    onChange("stage_schedule", setStageDate(stageSchedule, stage, edge, value));
  };

  if (compact) {
    return (
      <>
        <input
          type="text"
          value={deliverable.name}
          onChange={(e) => onChange("name", e.target.value)}
          placeholder="Deliverable name"
          autoFocus={autoFocusName}
          disabled={disabled}
          className="w-full border-none bg-transparent text-base font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/60"
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SelectPill
            icon={FileText}
            value={deliverable.type}
            onChange={(next) => onChange("type", next)}
            placeholder="Select content type"
            options={deliverableTypes.map((type) => ({
              value: type,
              label: type,
            }))}
          />

          <MultiSelectPill
            icon={Users}
            values={deliverable.required_stages || []}
            onToggle={onToggleStage}
            placeholder="Select stages"
            options={STAGES.map((stage) => ({
              value: stage,
              label: stage,
              icon: STAGE_ICONS[stage] || FileText,
            }))}
          />
        </div>

        {selectedStages.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Deadline per stage (optional)
            </p>
            {selectedStages.map((stage) => (
              <StageDateRow
                key={stage}
                stage={stage}
                window={stageSchedule[stage]}
                onChange={changeStageDate}
                disabled={disabled}
                size="sm"
              />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      {/* Name — large inline-style heading input */}
      <input
        type="text"
        value={deliverable.name}
        onChange={(e) => onChange("name", e.target.value)}
        placeholder="Deliverable name"
        autoFocus={autoFocusName}
        disabled={disabled}
        className="w-full border-none bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/60"
      />

      {/* Type */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <SelectPill
          icon={FileText}
          value={deliverable.type}
          onChange={(next) => onChange("type", next)}
          placeholder="Select content type"
          options={deliverableTypes.map((type) => ({
            value: type,
            label: type,
          }))}
        />
      </div>

      <div className="my-6 border-t border-border" />

      {/* Production stages, each with its own optional deadline window */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-muted-foreground">
          <Users className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            Production stages
          </h3>

          <p className="mt-0.5 text-sm text-muted-foreground">
            Select the teams that need to work on this deliverable, and
            optionally set each stage's own deadline window. The
            deliverable's overall dates are worked out automatically from
            these.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {STAGES.map((stage) => {
              const checked = deliverable.required_stages?.includes(stage);
              const StageIcon = STAGE_ICONS[stage] || FileText;

              return (
                <label
                  key={stage}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium transition-colors ${
                    checked
                      ? "border-[#2b2bb5] bg-[#f0f0fd] text-[#1a1a8a] ring-1 ring-[#2b2bb5]/20"
                      : "border-border bg-white text-foreground hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-xs ${
                      checked
                        ? "border-[#2b2bb5] bg-white text-[#2b2bb5]"
                        : "border-border bg-white text-muted-foreground"
                    }`}
                  >
                    {checked ? (
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
                        <path
                          d="M3 8.5L6.5 12L13 4.5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <StageIcon className="h-3.5 w-3.5" />
                    )}
                  </span>

                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleStage(stage)}
                    disabled={disabled}
                    className="sr-only"
                  />

                  {stage}
                </label>
              );
            })}
          </div>

          {selectedStages.length > 0 && (
            <div className="mt-4 space-y-2">
              {selectedStages.map((stage) => (
                <StageDateRow
                  key={stage}
                  stage={stage}
                  window={stageSchedule[stage]}
                  onChange={changeStageDate}
                  disabled={disabled}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};