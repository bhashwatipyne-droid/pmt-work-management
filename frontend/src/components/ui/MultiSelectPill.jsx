import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

// Same pill trigger as SelectPill, but for multi-select: the popover
// stays open across selections (each checkbox toggle doesn't close it)
// so someone can pick several options in one go.
export const MultiSelectPill = ({
  icon: Icon,
  values = [],
  options,
  onToggle,
  placeholder = "Select",
  triggerTestId,
}) => {
  const [open, setOpen] = useState(false);

  const selectedLabels = options
    .filter((option) => values.includes(option.value))
    .map((option) => option.label);

  const summary =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
        ? selectedLabels.join(", ")
        : `${selectedLabels.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={triggerTestId}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
        >
          {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}

          <span
            className={
              values.length ? "text-foreground" : "text-muted-foreground"
            }
          >
            {summary}
          </span>

          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-56 p-1">
        <div className="max-h-64 overflow-y-auto">
          {options.map((option) => {
            const checked = values.includes(option.value);
            const OptionIcon = option.icon;

            return (
              <label
                key={option.value}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-slate-100"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(option.value)}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 text-[#2b2bb5] focus:ring-[#2b2bb5]/20"
                />

                {OptionIcon && (
                  <OptionIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}

                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};