import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
const MOD = isMac ? "⌘" : "Ctrl";

// A long text cell (Remarks, Deliverable Name) opened out into a proper
// editor, anchored over the cell: room for a few lines of feedback, blockers or
// a long name. Enter is a new line, Ctrl/⌘+Enter or Save saves, Esc cancels,
// and clicking away saves. On a row the viewer can't edit it is read-only.
export function RemarksEditor({
  anchorEl,
  rowLabel,
  value,
  readOnly = false,
  onSave,
  onClose,
  title = "Remarks",
  placeholder = "Add remarks: feedback, blockers, what changed…",
  emptyText = "No remarks",
}) {
  const [draft, setDraft] = useState(value || "");
  const [pos, setPos] = useState(null);
  const textareaRef = useRef(null);

  useLayoutEffect(() => {
    const rect = anchorEl?.getBoundingClientRect() || { left: 300, top: 200, width: 300 };
    const width = Math.max(rect.width, 460);
    const height = 300;
    setPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(rect.top, window.innerHeight - height - 8)),
      width,
    });
  }, [anchorEl]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [pos]);

  const save = () => {
    if (readOnly) return onClose();
    onSave(draft);
  };

  const handleKeyDown = (event) => {
    // Nothing typed here should reach the sheet's own shortcuts.
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      save();
    }
  };

  if (!pos) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[60]"
        onMouseDown={(event) => {
          // Keep the browser from moving focus to <body>; closing puts it
          // back on the Remarks cell.
          event.preventDefault();
          save();
        }}
      />
      <div
        role="dialog"
        aria-label={`Edit ${title.toLowerCase()}`}
        onKeyDown={handleKeyDown}
        style={{ left: pos.left, top: pos.top, width: pos.width }}
        className="fixed z-[61] flex max-h-[calc(100vh-16px)] flex-col overflow-hidden rounded-[10px] bg-white shadow-[inset_0_0_0_2px_#2b2bb5,0_6px_25px_rgba(13,28,61,0.15)]"
      >
        <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
          <span className="text-xs font-semibold text-foreground">{title}</span>
          {rowLabel && (
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">· {rowLabel}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-slate-50"
          >
            <X className="h-3 w-3" />
          </button>
        </div>

        <textarea
          ref={textareaRef}
          aria-label={title}
          value={draft}
          readOnly={readOnly}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={readOnly ? emptyText : placeholder}
          rows={7}
          className="mx-3 max-h-[50vh] min-h-[140px] resize-y rounded-lg border-none bg-slate-50 px-3 py-2.5 text-sm leading-5 text-foreground outline-none"
        />

        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            {readOnly
              ? "View only · Esc to close"
              : `Enter for a new line · ${MOD} Enter to save · Esc to cancel`}
          </span>
          {!readOnly && (
            <span className="text-[11px] text-slate-400">{draft.length} characters</span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-7 rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-foreground hover:bg-slate-50"
          >
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button
              type="button"
              onClick={save}
              className="h-7 rounded-md bg-[#2b2bb5] px-3 text-xs font-semibold text-white hover:bg-[#1a1a8a]"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
