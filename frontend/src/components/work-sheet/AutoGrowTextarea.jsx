import { forwardRef } from "react";
import { Textarea } from "../ui/textarea";

// A sheet cell's text box. Long text is clipped on one line with an ellipsis,
// like every other cell, so all rows stay the same height; the full value is
// in the formula bar above the sheet (and in the expand editor for names and
// remarks). Kept under its old name so the cells that use it did not change.
export const AutoGrowTextarea = forwardRef(function AutoGrowTextarea(
  { value, className = "", ...props },
  ref
) {
  return (
    <Textarea
      ref={ref}
      rows={1}
      value={value}
      wrap="off"
      className={`h-8 min-h-8 resize-none overflow-hidden whitespace-nowrap py-[5px] leading-5 [text-overflow:ellipsis] ${className}`}
      {...props}
    />
  );
});