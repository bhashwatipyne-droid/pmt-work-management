import { useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  MAX_QUANTITY,
  formatMinutes,
  isMultiProjectRow,
  itemsOf,
  itemsTotal,
  loggedCount,
  projectIdsOf,
  typedCount,
  parseDuration,
  quantityOf,
  unitName,
} from "@/lib/quantity";

const STAGE_DOT = {
  Content: "bg-[#2b2bb5]",
  Design: "bg-sky-500",
  Animate: "bg-amber-500",
};

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// Side panel for a row's Qty: how many units the row covers, and the time each
// one took. Opened from the Qty cell. The row's Time is the total of the
// per-unit times once any are logged (the server keeps them in step).
//
// On a Campaign Ideation Plan row the units are the projects ticked in the
// Project cell: the quantity is fixed to that count (change it by ticking or
// unticking projects) and each line is named after its project.
export const QuantityPanel = ({ item, options, projects = [], canEdit, onUpdate, onClose }) => {
  const byProject = isMultiProjectRow(item);
  const projectNames = byProject
    ? projectIdsOf(item).map((id) => projects.find((p) => p.id === id)?.name || "Project")
    : [];
  const quantity = quantityOf(item);
  const items = itemsOf(item);
  const total = itemsTotal(items);
  const logged = loggedCount(item);
  const typed = typedCount(item);
  const rowMinutes = Number(item.time_taken_minutes) || 0;
  // The person's efficiency benchmark for one unit of this type (the row's
  // benchmark covers every unit). A unit with nothing typed counts as this.
  const perUnit = (Number(item.time_benchmark_minutes) || 0) / quantity;
  const autoText = perUnit > 0 ? formatMinutes(perUnit) : "";
  const unitOne = unitName(item, options, 1);
  const unitMany = unitName(item, options, 2);
  const Unit = capitalize(unitOne);

  // Text being typed, by unit index. Only present while a box is being edited,
  // so the saved value always shows otherwise.
  const [drafts, setDrafts] = useState({});
  const [qtyDraft, setQtyDraft] = useState(null);
  const firstEmptyRef = useRef(null);

  // Start on the first unit with no time yet, so times can be typed straight away.
  useEffect(() => {
    if (!canEdit) return;
    const timer = setTimeout(() => firstEmptyRef.current?.focus(), 60);
    return () => clearTimeout(timer);
    // Only when the panel opens for this row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    setDrafts({});
    setQtyDraft(null);
  }, [item.id]);

  // Esc closes the panel, unless a box is being edited (that Esc just leaves the box).
  useEffect(() => {
    const handler = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (event.target instanceof HTMLInputElement) return;
      onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const clearDraft = (index) =>
    setDrafts((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });

  const setQuantity = async (value) => {
    const n = Math.min(Math.max(Math.round(Number(value) || 0), 1), MAX_QUANTITY);
    setQtyDraft(null);
    if (!canEdit || byProject || n === quantity) return;
    const next = items.slice(0, n);
    while (next.length < n) next.push(null);
    await onUpdate(item.id, { quantity: n, quantity_items: next });
  };

  const commitItem = async (index, text) => {
    const minutes = parseDuration(text);
    // Left as the benchmark shown in the box: nothing was typed.
    if (minutes !== null && perUnit > 0 && items[index] == null && Math.abs(minutes - perUnit) < 0.5) {
      clearDraft(index);
      return;
    }
    if (minutes === null) {
      toast.error("Type a time like 20m, 1h 10m or just minutes.");
      clearDraft(index);
      return;
    }
    const next = minutes > 0 ? minutes : null;
    clearDraft(index);
    if (next === (items[index] ?? null)) return;
    await onUpdate(item.id, {
      quantity_items: items.map((current, i) => (i === index ? next : current)),
    });
  };

  const canSplit = canEdit && typed === 0 && rowMinutes > 0 && !perUnit;
  const splitEvenly = async () => {
    const whole = Math.round(rowMinutes);
    const each = Math.floor(whole / quantity);
    const extra = whole - each * quantity;
    const result = await onUpdate(item.id, {
      quantity_items: items.map((_, i) => each + (i < extra ? 1 : 0) || null),
    });
    if (result?.success) {
      toast.success(`Split ${formatMinutes(whole)} across ${quantity} ${unitMany}`);
    }
  };

  const clearAll = () =>
    onUpdate(item.id, { quantity_items: items.map(() => null) });

  const focusItem = (index) => {
    const input = document.querySelector(`[data-qty-item="${index}"]`);
    if (!input) return false;
    input.focus();
    input.select?.();
    return true;
  };

  const percent = Math.round((logged / quantity) * 100);
  const customised = perUnit > 0 ? typed : 0;
  let firstEmptyAssigned = false;

  return (
    <aside
      role="complementary"
      aria-label="Time per item"
      data-testid="worksheet-qty-panel"
      className="fixed inset-y-0 right-0 z-50 flex w-[min(400px,100vw)] flex-col bg-white shadow-[-6px_0_25px_rgba(13,28,61,0.1)] ring-1 ring-slate-200"
    >
      <div className="flex items-start gap-3 border-b border-slate-200 py-4 pl-5 pr-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`h-2 w-2 rounded-full ${STAGE_DOT[item.stage] || "bg-slate-400"}`} />
            {item.stage} · time per item
          </span>
          <span className="text-base font-semibold leading-5 text-slate-900">
            {item.deliverable_name || "Untitled deliverable"}
          </span>
          <span className="text-xs text-slate-500">
            {[item.deliverable_type, item.work_date].filter(Boolean).join(" · ")}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
          className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-3.5 border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex flex-1 flex-col gap-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Quantity
            </span>
            <span className="text-xs text-slate-500">
              {byProject
                ? "Fetched from the projects ticked for this analysis"
                : `Number of ${unitMany}`}
            </span>
          </span>
          {byProject ? (
            <span
              data-testid="worksheet-qty-fixed"
              className="flex h-[34px] min-w-12 items-center justify-center rounded-md bg-[#f0f0fd] px-3 text-base font-bold tabular-nums text-[#1a1a8a]"
            >
              {quantity}
            </span>
          ) : (
          <div className="flex items-center rounded-md bg-white ring-1 ring-inset ring-slate-300">
            <button
              type="button"
              aria-label="Decrease"
              disabled={!canEdit || quantity <= 1}
              onClick={() => setQuantity(quantity - 1)}
              className="flex h-[34px] w-8 items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              aria-label="Quantity"
              data-testid="worksheet-qty-input"
              inputMode="numeric"
              disabled={!canEdit}
              value={qtyDraft ?? String(quantity)}
              onChange={(event) => setQtyDraft(event.target.value.replace(/[^0-9]/g, ""))}
              onBlur={() => {
                if (qtyDraft !== null && qtyDraft !== "") setQuantity(qtyDraft);
                else setQtyDraft(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  setQtyDraft(null);
                  event.currentTarget.blur();
                }
              }}
              className="h-[34px] w-12 border-0 bg-transparent text-center text-base font-bold tabular-nums text-slate-900 outline-none"
            />
            <button
              type="button"
              aria-label="Increase"
              disabled={!canEdit || quantity >= MAX_QUANTITY}
              onClick={() => setQuantity(quantity + 1)}
              className="flex h-[34px] w-8 items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="flex flex-col gap-0.5 rounded-lg bg-slate-50 px-3 py-2.5">
            <span className="text-xs text-slate-500">Total time</span>
            <span className="text-base font-semibold tabular-nums text-slate-900">
              {formatMinutes(rowMinutes)}
            </span>
            <span className="text-[11px] text-slate-500">
              {perUnit
                ? `${formatMinutes(perUnit)} per ${unitOne} from your benchmark`
                : typed
                  ? `${formatMinutes(total / typed)} avg per ${unitOne}`
                  : rowMinutes
                    ? "Row time, not split yet"
                    : "No time logged yet"}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-lg bg-slate-50 px-3 py-2.5">
            <span className="text-xs text-slate-500">Progress</span>
            <span className="text-base font-semibold tabular-nums text-slate-900">{percent}%</span>
            <span className="h-1 overflow-hidden rounded-full bg-slate-200">
              <span
                className="block h-full rounded-full bg-emerald-500"
                style={{ width: `${percent}%` }}
              />
            </span>
            <span className="text-[11px] text-slate-500">
              {logged} of {quantity} have time
              {customised > 0 ? `, ${customised} edited` : perUnit ? ", all from your benchmark" : ""}
            </span>
          </div>
        </div>

        {canSplit && (
          <button
            type="button"
            onClick={splitEvenly}
            className="h-8 rounded-md bg-[#f0f0fd] text-xs font-semibold text-[#1a1a8a] hover:bg-[#e3e3fb]"
          >
            Split {formatMinutes(rowMinutes)} evenly across {quantity}
          </button>
        )}
      </div>

      <div className="grid h-9 grid-cols-[40px_minmax(0,1fr)_120px] items-center gap-x-3 border-b border-slate-200 bg-slate-50 px-5 text-xs font-semibold text-slate-700">
        <span>No.</span>
        <span>{byProject ? "Item / project" : "Item"}</span>
        <span>Time taken</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {items.map((minutes, index) => {
          const has = Number(minutes) > 0;
          const label = byProject ? projectNames[index] || `${Unit} ${index + 1}` : `${Unit} ${index + 1}`;
          const attachFirstEmpty = !has && !firstEmptyAssigned;
          if (attachFirstEmpty) firstEmptyAssigned = true;

          return (
            <div
              key={index}
              className="grid min-h-11 grid-cols-[40px_minmax(0,1fr)_120px] items-center gap-x-3 border-b border-slate-100 px-5 hover:bg-slate-50"
            >
              <span
                className={`h-6 w-7 rounded-md text-center text-xs font-semibold leading-6 tabular-nums ${
                  has ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                }`}
              >
                {index + 1}
              </span>
              <span
                className={`text-[13px] leading-4 text-slate-900 ${byProject ? "py-1.5" : ""}`}
                title={byProject ? label : undefined}
              >
                {label}
              </span>
              <input
                ref={attachFirstEmpty ? firstEmptyRef : undefined}
                data-qty-item={index}
                aria-label={`Time taken for ${label}`}
                disabled={!canEdit}
                placeholder={perUnit ? formatMinutes(perUnit) : "e.g. 20m"}
                value={drafts[index] ?? (has ? formatMinutes(minutes) : autoText)}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [index]: event.target.value }))
                }
                onFocus={(event) => event.target.select()}
                onBlur={(event) => {
                  if (drafts[index] !== undefined) commitItem(index, event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "ArrowDown") {
                    event.preventDefault();
                    if (!focusItem(index + 1)) event.currentTarget.blur();
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    focusItem(index - 1);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    clearDraft(index);
                    event.currentTarget.blur();
                  }
                }}
                className={`h-[30px] w-full rounded-md border-0 bg-white px-2.5 text-[13px] font-medium tabular-nums outline-none ${
                  !has && autoText && drafts[index] === undefined ? "text-[#2b2bb5]" : "text-slate-900"
                } ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-[#2b2bb5] disabled:bg-slate-50 disabled:text-slate-500`}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        <span className="flex-1 text-[11px] leading-[14px] text-slate-500">
          {perUnit
            ? "Filled from your benchmark (blue). Type 20m or 1h 10m to override one. Clear a box to go back. The row’s Time is the total."
            : "Type 20m or 1h 10m. Enter moves down. The row’s Time updates to the total."}
        </span>
        {canEdit && typed > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="h-[30px] rounded-md px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="h-[30px] rounded-md bg-[#2b2bb5] px-3.5 text-xs font-semibold text-white hover:bg-[#1a1a8a]"
        >
          Done
        </button>
      </div>
    </aside>
  );
};
