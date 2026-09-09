import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";

export function SearchableSelect({
  value,
  onValueChange,
  options = [],
  placeholder = "Select",
  searchPlaceholder = "Type to search...",
  emptyText = "No matches found",
  disabled = false,
  open = false,
  onOpenChange,
  triggerProps = {},
  className = "",
  contentClassName = "w-[220px] p-0",
  // Optional: render the closed trigger's value as something other than
  // plain text (e.g. a colored status chip). Receives the matched option
  // (or undefined) and the raw value.
  renderValue,
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);

  const normalizedOptions = options
    .filter(Boolean)
    .map((option) =>
      typeof option === "string"
        ? { value: option, label: option }
        : option
    );

  const selectedOption = normalizedOptions.find(
    (option) => String(option.value) === String(value)
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }

    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const handleOpenChange = (nextOpen) => {
    if (disabled) return;
    if (!nextOpen) setSearch("");
    onOpenChange?.(nextOpen);
  };

  const handleTriggerKeyDown = (event) => {
    triggerProps.onKeyDown?.(event);

    if (
      event.defaultPrevented ||
      disabled ||
      open ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }

    if (event.key.length === 1) {
      event.preventDefault();
      setSearch(event.key);
      onOpenChange?.(true);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...triggerProps}
          disabled={disabled}
          onKeyDown={handleTriggerKeyDown}
          className={`flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 text-left text-[13px] outline-none ${className}`}
        >
          <span className="min-w-0 truncate">
            {renderValue
              ? renderValue(selectedOption, value)
              : selectedOption?.label || (value ? String(value) : placeholder)}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className={contentClassName}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <Command shouldFilter={true} value={undefined}>
          <CommandInput
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder={searchPlaceholder}
            onKeyDown={(event) => {
              // Clicking this cell opened the popover and moved focus
              // into this search box — so normally every key here is
              // cmdk's own list search/navigation (stopPropagation stops
              // it reaching the sheet's handler at all).
              const isShiftArrow =
                event.shiftKey &&
                ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
                  event.key
                );

              // Shift+Arrow (range selection) has no meaning in a search
              // list, so forward it to the trigger's own handler (that's
              // where arrow-key navigation actually lives) and close the
              // dropdown since we're leaving "pick a value" mode.
              if (isShiftArrow) {
                triggerProps.onKeyDown?.(event);
                if (event.defaultPrevented) {
                  onOpenChange?.(false);
                }
                return;
              }

              const isCopyOrPaste =
                (event.ctrlKey || event.metaKey) &&
                ["c", "v"].includes(event.key.toLowerCase());

              // Copy/paste also has no meaning here, but unlike arrow
              // navigation, that logic doesn't live on the trigger's own
              // handler at all — it's a separate document-level listener
              // the sheet sets up. So there's nothing useful to forward
              // to; just let the event bubble up undisturbed instead of
              // eating it.
              if (isCopyOrPaste) {
                return;
              }

              event.stopPropagation();
            }}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {normalizedOptions.map((option) => (
              <CommandItem
                key={String(option.value)}
                value={`${option.label} ${option.value}`}
                disabled={option.disabled}
                onSelect={() => {
                  onValueChange?.(option.value);
                  onOpenChange?.(false);
                }}
              >
                <Check
                  className={`h-4 w-4 ${
                    String(option.value) === String(value)
                      ? "opacity-100"
                      : "opacity-0"
                  }`}
                />
                <span className="min-w-0 truncate">{option.label}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}