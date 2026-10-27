import { forwardRef, useCallback, useLayoutEffect, useRef } from "react";
import { Textarea } from "../ui/textarea";

// A sheet cell's text box. Long text is clipped on one line with an ellipsis,
// like every other cell, so all rows stay the same height; the full value is
// in the formula bar above the sheet (and in the expand editor for names and
// remarks). When the column is set to "Wrap text" (its cell carries the
// sheet-cell-wrap class) the box instead grows to show every line.
// Kept under its old name so the cells that use it did not change.
export const AutoGrowTextarea = forwardRef(function AutoGrowTextarea(
  { value, className = "", ...props },
  ref
) {
  const innerRef = useRef(null);
  const setRefs = useCallback(
    (node) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return undefined;
    const fit = () => {
      if (el.closest(".sheet-cell-wrap")) {
        el.style.height = "auto";
        el.style.height = `${Math.max(32, el.scrollHeight)}px`;
      } else {
        el.style.height = "";
      }
    };
    fit();
    // The column can be resized or (un)wrapped without the text changing.
    if (typeof ResizeObserver === "undefined") return undefined;
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  });

  return (
    <Textarea
      ref={setRefs}
      rows={1}
      value={value}
      wrap="off"
      className={`h-8 min-h-8 resize-none overflow-hidden whitespace-nowrap py-[5px] leading-5 [text-overflow:ellipsis] ${className}`}
      {...props}
    />
  );
});
