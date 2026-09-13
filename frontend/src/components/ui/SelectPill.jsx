import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

// A pill-shaped dropdown trigger, built on the app's existing Popover
// primitive. Use this instead of a styled native <select> — a
// transparent native select still renders the browser's own arrow and
// can't be restyled consistently across browsers.
export const SelectPill = ({
  icon: Icon,
  value,
  options,
  onChange,
  placeholder = "Select",
  triggerTestId,
}) => {
  const [open, setOpen] = useState(false);

  const selected = options.find((option) => option.value === value);

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
              selected ? "text-foreground" : "text-muted-foreground"
            }
          >
            {selected ? selected.label : placeholder}
          </span>

          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-56 p-1">
        <div className="max-h-64 overflow-y-auto">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-slate-100"
            >
              <span>{option.label}</span>

              {option.value === value && (
                <Check className="h-3.5 w-3.5 shrink-0 text-[#2b2bb5]" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};