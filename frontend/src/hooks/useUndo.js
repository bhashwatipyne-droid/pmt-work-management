import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";

// Ctrl/Cmd+Z for a page. Actions push an entry that knows how to reverse them
// (`pushUndo(label, undoFn)`); the shortcut runs the latest one.
//
// Typing in a text box keeps the browser's own undo, and nothing happens while
// a dialog is open, so this only fires when focus is on the page itself.
export function useUndo() {
  const stackRef = useRef([]);
  const busyRef = useRef(false);

  const pushUndo = useCallback((label, undo) => {
    stackRef.current.push({ label, undo });
    if (stackRef.current.length > 50) stackRef.current.shift();
  }, []);

  const runUndo = useCallback(async () => {
    if (busyRef.current) return;
    const entry = stackRef.current.pop();
    if (!entry) {
      toast("Nothing to undo");
      return;
    }

    busyRef.current = true;
    try {
      await entry.undo();
      toast.success(`Undid: ${entry.label}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || `Could not undo: ${entry.label}`);
    } finally {
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      if (String(event.key).toLowerCase() !== "z") return;

      const el = event.target;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable ||
        el?.getAttribute?.("role") === "combobox"
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;

      event.preventDefault();
      runUndo();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [runUndo]);

  return { pushUndo, runUndo };
}
