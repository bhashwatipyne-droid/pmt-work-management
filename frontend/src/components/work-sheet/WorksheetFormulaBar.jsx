import { useEffect, useRef, useState } from "react";

// The bar above the sheet (Excel's "formula bar"): the name box on the left
// says which cell is selected, the box beside "fx" shows its full value, so
// text that is clipped in a narrow column can still be read in full.
//
// Text cells (Deliverable Name, Link, Version, Remarks) can also be edited
// here; every other cell is shown read-only (the text can still be selected
// and copied). While you type in a cell, the bar follows what you type.
//
// Props
//   label        "Row 12 · Remarks", or null when no cell is selected
//   value        the selected cell's full text
//   activeRow/activeCol  the selected cell, so the bar can follow what is
//                typed into it before it has saved
//   editable     whether the bar can edit this cell
//   placeholder  hint shown when the value is empty
//   onCommit     (text) => void, saves an edit made in the bar
//   onFinish     (move) => void, put focus back on the sheet; move is
//                "down", "right" or "left"/"up" for Shift, or "stay"
export function WorksheetFormulaBar({
  label,
  value,
  activeRow,
  activeCol,
  editable,
  placeholder,
  onCommit,
  onFinish,
}) {
  const [draft, setDraft] = useState(null);
  const draftRef = useRef(null);
  // What the draft will be saved with. Captured when editing starts, because
  // clicking another cell changes the selection before this box loses focus,
  // and the edit must still go to the cell it was made for.
  const editRef = useRef(null);

  // What is being typed into the selected cell right now (null when
  // nothing is). The bar listens to the page itself instead of being told by
  // the sheet: re-rendering the sheet in the middle of a keystroke makes its
  // cells drop the character just typed.
  const [live, setLive] = useState(null);
  const activeRef = useRef({ row: activeRow, col: activeCol });
  activeRef.current = { row: activeRow, col: activeCol };

  useEffect(() => {
    setLive(null);
  }, [activeRow, activeCol]);

  useEffect(() => {
    const onInput = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      const cell = target.closest?.("[data-sheet-cell]");
      if (!cell) return;
      const { row, col } = activeRef.current;
      if (
        Number(cell.getAttribute("data-sheet-row")) !== row ||
        Number(cell.getAttribute("data-sheet-col")) !== col
      ) {
        return;
      }
      setLive(target.value);
    };
    const onFocusOut = (event) => {
      if (event.target?.closest?.("[data-sheet-cell]")) setLive(null);
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("focusout", onFocusOut, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("focusout", onFocusOut, true);
    };
  }, []);

  const setDraftBoth = (next) => {
    draftRef.current = next;
    setDraft(next);
  };

  // Another cell was selected without the box losing focus first (rare):
  // drop the draft rather than carry it over.
  useEffect(() => {
    if (draftRef.current === null) return;
    if (document.activeElement?.dataset?.formulaInput === "1") return;
    setDraftBoth(null);
  }, [label]);

  const finish = (save, move) => {
    const text = draftRef.current;
    const edit = editRef.current;
    setDraftBoth(null);
    editRef.current = null;
    if (save && text !== null && edit && text !== edit.original) edit.commit(text);
    onFinish?.(move);
  };

  const shown = draft !== null ? draft : live !== null && live !== undefined ? live : value;

  return (
    <div
      data-testid="worksheet-formula-bar"
      className="flex h-9 shrink-0 items-center border-b border-slate-200 bg-white"
    >
      <div
        data-testid="worksheet-formula-name"
        title={label || undefined}
        className="flex h-full w-[132px] shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap border-r border-slate-200 px-3 text-[12px] font-medium leading-4 text-slate-700"
      >
        <span className="truncate">{label || "No cell selected"}</span>
      </div>
      <span
        aria-hidden="true"
        className="select-none px-2.5 text-[12px] font-semibold italic leading-4 text-slate-400"
      >
        fx
      </span>
      <input
        data-formula-input="1"
        data-testid="worksheet-formula-input"
        aria-label="Cell value"
        value={shown ?? ""}
        readOnly={!editable}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => {
          if (!editable || draftRef.current !== null) return;
          editRef.current = { original: value ?? "", commit: onCommit };
          setDraftBoth(shown ?? "");
        }}
        onChange={(event) => {
          if (!editable) return;
          setDraftBoth(event.target.value);
        }}
        onKeyDown={(event) => {
          const { key } = event;
          if (key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finish(false, "stay");
            return;
          }
          if (key === "Enter" || key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            const move =
              key === "Enter"
                ? event.shiftKey
                  ? "up"
                  : "down"
                : event.shiftKey
                  ? "left"
                  : "right";
            if (draftRef.current === null) {
              onFinish?.(move);
              return;
            }
            finish(true, move);
          }
        }}
        onBlur={() => {
          // Leaving the box by clicking elsewhere saves the edit, like
          // every other cell.
          if (draftRef.current === null) return;
          const text = draftRef.current;
          const edit = editRef.current;
          setDraftBoth(null);
          editRef.current = null;
          if (edit && text !== edit.original) edit.commit(text);
        }}
        className="h-full min-w-0 flex-1 border-0 bg-transparent pr-3 text-[13px] text-slate-900 outline-none placeholder:text-slate-400 read-only:cursor-default focus:bg-[#f7f9fc]"
      />
    </div>
  );
}