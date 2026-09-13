import { FileText, Pencil, Play, Users, CalendarDays } from "lucide-react";
import { SelectPill } from "@/components/ui/SelectPill";
import { DatePill } from "@/components/ui/DatePill";
import { STAGES } from "@/constants/projectPalette";

const STAGE_ICONS = {
  Content: FileText,
  Design: Pencil,
  Animate: Play,
};

// Just the form fields for a deliverable — name, type, dates, and
// production stages. No modal chrome, no save/cancel buttons, no API
// calls. Used both inside the standalone DeliverableModal and inline
// in CreateProjectModal's "Create deliverable" card, so the two never
// drift apart visually.
export const DeliverableFields = ({
  deliverable,
  onChange,
  onToggleStage,
  deliverableTypes = [],
  disabled = false,
  autoFocusName = true,
}) => {
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

      {/* Meta row: Type / Start date / Target date */}
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

        <DatePill
          icon={CalendarDays}
          value={deliverable.start_dt}
          onChange={(next) => onChange("start_dt", next)}
          placeholder="Start date"
        />

        <DatePill
          icon={CalendarDays}
          value={deliverable.end_dt}
          onChange={(next) => onChange("end_dt", next)}
          placeholder="Target date"
        />
      </div>

      <div className="my-6 border-t border-border" />

      {/* Production stages */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-muted-foreground">
          <Users className="h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">
            Production stages
          </h3>

          <p className="mt-0.5 text-sm text-muted-foreground">
            Select the teams that need to work on this deliverable.
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
        </div>
      </div>
    </>
  );
};