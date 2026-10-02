import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import { Textarea } from "../ui/textarea";

// A sheet cell's text box that wraps long text and grows with it, so the whole
// value is readable in place instead of being clipped on one line. The row
// grows with the box. Re-measured when the text changes and when the column
// is resized (a different width wraps differently).
export const AutoGrowTextarea = forwardRef(function AutoGrowTextarea(
  { value, className = "", ...props },
  ref
) {
  const innerRef = useRef(null);
  useImperativeHandle(ref, () => innerRef.current);

  const resize = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight leaves out the border; add it back so the last line is
    // not clipped.
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, []);

  useLayoutEffect(resize, [value, resize]);

  useEffect(() => {
    const el = innerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;

    let width = el.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (el.offsetWidth === width) return;
      width = el.offsetWidth;
      resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [resize]);

  return (
    <Textarea
      ref={innerRef}
      rows={1}
      value={value}
      className={`min-h-8 resize-none overflow-hidden py-[5px] leading-5 ${className}`}
      {...props}
    />
  );
});
