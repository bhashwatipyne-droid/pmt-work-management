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
import { focusAdjacentCell } from "./useWorksheetKeyboardNavigation";

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
  contentClassName = "w-[400px] p-0",
  // Optional: render the closed trigger's value as something other than
  // plain text (e.g. a colored status chip). Receives the matched option
  // (or undefined) and the raw value.
  renderValue,
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef(null);
  const triggerRef = useRef(null);
  // Set when Tab leaves the dropdown for the next cell, so closing doesn't
  // pull focus back to this cell's trigger.
  const leavingByTabRef = useRef(false);

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
    }
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
          ref={triggerRef}
          type="button"
          {...triggerProps}
          disabled={disabled}
          onKeyDown={handleTriggerKeyDown}
          className={`flex min-h-8 w-full items-start justify-between gap-2 rounded-md px-2 py-[5px] text-left text-[13px] leading-5 outline-none ${className}`}
        >
          {/* Long values wrap onto more lines (the cell grows) rather than
              being cut off with an ellipsis. */}
          <span className="min-w-0 flex-1 whitespace-normal break-words">
            {renderValue
              ? renderValue(selectedOption, value)
              : selectedOption?.label || (value ? String(value) : placeholder)}
          </span>
          <ChevronsUpDown className="mt-[3px] h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        className={contentClassName}
        onOpenAutoFocus={(event) => {
          // Focus the search box once the content has mounted. Doing it from
          // the open effect could run before the box existed, so a dropdown
          // opened by typing kept focus on the cell and lost every key after
          // the first.
          event.preventDefault();
          const input = inputRef.current;
          if (!input) return;
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }}
        onCloseAutoFocus={(event) => {
          if (leavingByTabRef.current) {
            leavingByTabRef.current = false;
            event.preventDefault();
          }
        }}
      >
        <Command shouldFilter={true} value={undefined}>
          <CommandInput
            ref={inputRef}
            value={search}
            onValueChange={setSearch}
            placeholder={searchPlaceholder}
            onKeyDown={(event) => {
              // Tab / Shift+Tab: close without changing the value and move
              // on to the next / previous cell, like everywhere else in the
              // sheet. Left alone, Tab went to whatever the browser found
              // next in the page, far from the sheet.
              if (event.key === "Tab") {
                event.preventDefault();
                event.stopPropagation();
                leavingByTabRef.current = true;
                onOpenChange?.(false);
                focusAdjacentCell(triggerRef.current, event.shiftKey ? -1 : 1);
                return;
              }

              // Left / Right with nothing typed: close the list without
              // changing the value and step to the neighbouring cell, so the
              // arrow keys keep working after a click opened this dropdown.
              // (Up / Down stay with the list.)
              if (
                (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
                !search &&
                !event.shiftKey &&
                !event.ctrlKey &&
                !event.metaKey &&
                !event.altKey
              ) {
                event.preventDefault();
                event.stopPropagation();
                leavingByTabRef.current = true;
                onOpenChange?.(false);
                focusAdjacentCell(triggerRef.current, event.key === "ArrowLeft" ? -1 : 1, false);
                return;
              }

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

              // Up / Down / Home / End / Enter are the list's own keys: they
              // have to reach the list (it listens on its root, above this
              // box) or the options cannot be picked from the keyboard. The
              // cell's key handler ignores events from inside the popover.
              if (["ArrowUp", "ArrowDown", "Home", "End", "Enter"].includes(event.key)) {
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
                className="items-start"
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
                <span className="min-w-0 flex-1 whitespace-normal break-words leading-5">
                  {option.label}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}