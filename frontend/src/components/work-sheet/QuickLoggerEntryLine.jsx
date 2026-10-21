import { AlertCircle, Plus } from "lucide-react";
import { DURATION_PRESETS, formatDuration } from "./quickLoggerLogic";
import { ProjectNameParts } from "./ProjectPicker";

export function QuickLoggerEntryLine(ctx) {
  const { benchmarkMinutes, chips, clientNameOf, commitDraft, currentStep, draft, durationIsAuto, entryCardRef, error, handleKeyDown, highlightedIndex, inputRef, lookalikes, parsedDuration, resolvedType, selectSuggestion, setQuickDuration, setShowRemark, setSuggestionsNonce, showRemark, stepTitle, suggestionRefs, suggestions, updateDraft } = ctx;
  return (
    <>
    {/* Entry line */}
    <div ref={entryCardRef} className="flex flex-col gap-2.5 px-5 pb-4 pt-3.5">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={draft.text}
          onChange={(event) =>
            updateDraft({
              text: event.target.value,
              client_id: "",
              project_id: "",
              deliverable_id: "",
              deliverable_type: "",
              time_taken_minutes: "",
            })
          }
          onKeyDown={handleKeyDown}
          onClick={() => {
            if (!suggestions.length) setSuggestionsNonce((n) => n + 1);
          }}
          placeholder="Client / Project / Deliverable / Type / Time"
          autoComplete="off"
          spellCheck="false"
          className="h-11 w-full rounded-lg border-none bg-white px-3.5 text-[15px] text-foreground shadow-[inset_0_0_0_1px_#2b2bb5,0_0_0_3px_#dcdcf8] outline-none placeholder:text-muted-foreground"
          aria-label="Quick work entry"
        />

        {suggestions.length > 0 && (
          <div
            role="listbox"
            className="absolute inset-x-0 top-[50px] z-20 rounded-[10px] bg-white p-1 shadow-[0_0_0_1px_rgb(234,238,244),0_6px_15px_rgba(13,28,61,0.08)]"
          >
            <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase leading-[14px] tracking-[0.05em] text-muted-foreground">
              {stepTitle}
            </div>
            <div className="max-h-64 overflow-y-auto">
              {suggestions.map((item, index) => {
                const label =
                  typeof item === "string"
                    ? item
                    : currentStep === "project"
                    ? item.name
                    : item.name || item.deliverable_name || "Untitled deliverable";

                return (
                  <button
                    key={typeof item === "string" ? item : item.id}
                    ref={(node) => {
                      suggestionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={index === highlightedIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectSuggestion(item)}
                    className={[
                      "flex min-h-8 w-full items-start gap-2 rounded-[7px] px-2.5 py-1 text-left text-[13px] transition-colors",
                      index === highlightedIndex
                        ? "bg-[#f0f0fd] text-foreground"
                        : "text-foreground hover:bg-[#f0f0fd]",
                    ].join(" ")}
                  >
                    {currentStep === "project" ? (
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="whitespace-normal break-words">
                          <ProjectNameParts
                            project={item}
                            twins={lookalikes.get(item.id) || []}
                            clientNameOf={clientNameOf}
                          />
                        </span>
                        {item.description && (
                          <span className="whitespace-normal break-words text-xs leading-4 text-slate-600">
                            {item.description}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="min-w-0 flex-1 self-center whitespace-normal break-words">
                        {label}
                      </span>
                    )}
                    {index === highlightedIndex && (
                      <span className="self-center text-[11px] text-muted-foreground">Enter</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* What has been understood so far */}
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([label, value]) => (
          <span
            key={label}
            title={value ? `${label}: ${value}` : label}
            className={[
              "inline-flex h-[26px] max-w-[200px] items-center gap-1.5 rounded-full px-2.5 text-xs",
              value
                ? "bg-[#f0f0fd] text-[#1a1a8a] shadow-[inset_0_0_0_1px_#dcdcf8]"
                : "bg-white text-muted-foreground shadow-[inset_0_0_0_1px_rgb(226,232,240)]",
            ].join(" ")}
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                value ? "bg-[#2b2bb5]" : "bg-slate-300"
              }`}
            />
            <span className="truncate">{value || label}</span>
          </span>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {showRemark && (
        <input
          type="text"
          value={draft.remarks}
          onChange={(e) => updateDraft({ remarks: e.target.value })}
          placeholder="Remark (optional)"
          aria-label="Remark"
          className="h-9 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
        />
      )}

      {durationIsAuto && (
        <p className="text-xs text-[#2b2bb5]">
          Time filled from your benchmark for {resolvedType} ({formatDuration(benchmarkMinutes)}).
          Type a duration, or pick one below, to change it.
        </p>
      )}

      {/* Duration presets + add */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Duration</span>
        {DURATION_PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            onClick={() => setQuickDuration(minutes)}
            className={[
              "h-[26px] rounded-[7px] px-2.5 text-xs font-medium transition-colors",
              parsedDuration === minutes
                ? "bg-[#f0f0fd] text-[#1a1a8a] shadow-[inset_0_0_0_1px_#2b2bb5]"
                : "bg-white text-slate-700 shadow-[inset_0_0_0_1px_rgb(226,232,240)] hover:bg-[#f0f0fd]",
            ].join(" ")}
          >
            {formatDuration(minutes)}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setShowRemark((v) => !v)}
          className="ml-1 h-[26px] rounded-[7px] px-2 text-xs font-medium text-[#2b2bb5] hover:bg-[#f0f0fd]"
        >
          {showRemark ? "Hide remark" : "+ Remark"}
        </button>

        <span className="flex-1" />

        <button
          type="button"
          onClick={() => commitDraft()}
          disabled={!draft.text.trim()}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#f0f0fd] px-3 text-[13px] font-semibold text-[#2b2bb5] transition-colors hover:bg-[#dcdcf8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add entry
        </button>
      </div>
    </div>
    </>
  );
}
