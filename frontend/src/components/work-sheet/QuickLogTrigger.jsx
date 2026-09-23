import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

// Default resting spot — bottom-right, with a little breathing room from
// the edge. Position is session-only: every fresh page load starts back
// here, exactly as specified (no localStorage), even though the button
// is freely draggable anywhere on screen while the page is open.
const EDGE_MARGIN = 24;

// A press that moves less than this many pixels still counts as a click
// (opens the logger) rather than a drag — otherwise every click would
// have to land pixel-perfectly still to register.
const DRAG_THRESHOLD = 4;

export const QuickLogTrigger = ({ onOpen }) => {
  const [position, setPosition] = useState(null); // null = default bottom-right via CSS
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const buttonRef = useRef(null);

  // Clamps against the button's own current size (it's a pill that sizes
  // to its label, not a fixed square) rather than a hardcoded constant.
  const clampToViewport = useCallback((left, top) => {
    const rect = buttonRef.current?.getBoundingClientRect();
    const width = rect?.width || 140;
    const height = rect?.height || 56;
    const maxLeft = window.innerWidth - width - 8;
    const maxTop = window.innerHeight - height - 8;
    return {
      left: Math.min(Math.max(8, left), Math.max(8, maxLeft)),
      top: Math.min(Math.max(8, top), Math.max(8, maxTop)),
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!draggingRef.current) return;

      const dx = event.clientX - dragStartRef.current.x;
      const dy = event.clientY - dragStartRef.current.y;

      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        movedRef.current = true;
      }

      setPosition(
        clampToViewport(
          dragStartRef.current.left + dx,
          dragStartRef.current.top + dy
        )
      );
    };

    const handlePointerUp = () => {
      draggingRef.current = false;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [clampToViewport]);

  // Free-drag can end up anywhere — if the window is resized (or rotated
  // on mobile) smaller than wherever it was left, pull it back on screen
  // rather than leaving it stranded off the visible area.
  useEffect(() => {
    const handleResize = () => {
      setPosition((current) =>
        current ? clampToViewport(current.left, current.top) : current
      );
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampToViewport]);

  const handlePointerDown = (event) => {
    // Only the primary button/touch starts a drag.
    if (event.button !== undefined && event.button !== 0) return;

    const rect = buttonRef.current.getBoundingClientRect();
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      left: rect.left,
      top: rect.top,
    };
    draggingRef.current = true;
    movedRef.current = false;

    // Switch from the default bottom-right CSS anchor to an explicit
    // left/top the moment a drag starts, so the button doesn't jump.
    if (!position) {
      setPosition({ left: rect.left, top: rect.top });
    }
  };

  const handleClick = () => {
    if (movedRef.current) {
      // This click is the tail end of a drag, not an intentional press —
      // swallow it so dragging the button never also opens the logger.
      movedRef.current = false;
      return;
    }
    onOpen();
  };

  const style = position
    ? { left: position.left, top: position.top, right: "auto", bottom: "auto" }
    : { right: EDGE_MARGIN, bottom: EDGE_MARGIN };

  return (
    <button
      ref={buttonRef}
      type="button"
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      style={{ position: "fixed", zIndex: 40, touchAction: "none", ...style }}
      className="flex h-14 cursor-grab items-center gap-2 rounded-full bg-[#2b2bb5] pl-4 pr-5 text-white shadow-xl transition-colors hover:bg-[#1a1a8a] active:cursor-grabbing"
      title="Quick log (press L)"
      aria-label="Open quick logger"
    >
      <Plus className="h-5 w-5" />
      <span className="text-sm font-semibold">Quick log</span>
    </button>
  );
};