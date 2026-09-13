import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

// A pill-shaped date trigger backed by the app's existing Calendar +
// Popover primitives (same ones used by the Projects page date-range
// picker). value/onChange work in plain "yyyy-MM-dd" strings, matching
// a native <input type="date">, so it's a drop-in replacement.
export const DatePill = ({
  icon: Icon,
  value,
  onChange,
  placeholder = "Select date",
  triggerTestId,
}) => {
  const [open, setOpen] = useState(false);

  const dateValue = value ? parseISO(value) : undefined;

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
            className={value ? "text-foreground" : "text-muted-foreground"}
          >
            {value ? format(dateValue, "dd MMM yyyy") : placeholder}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-auto rounded-xl p-0">
        <Calendar
          mode="single"
          selected={dateValue}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
};