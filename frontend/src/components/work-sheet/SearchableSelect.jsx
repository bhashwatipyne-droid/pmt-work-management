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
            {selectedOption?.label || (value ? String(value) : placeholder)}
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
