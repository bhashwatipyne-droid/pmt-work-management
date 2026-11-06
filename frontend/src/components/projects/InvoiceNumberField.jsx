import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { toast } from "sonner";

import { setInvoiceNumber } from "@/services/api";

// Projects that are being billed carry an invoice number.
export const INVOICE_STATUSES = new Set(["Ready for Invoice", "Raised Invoice"]);
export const hasInvoiceSlot = (project) => INVOICE_STATUSES.has(project?.status);

// The project's invoice number, typed in place on a board card, a list row or
// the project page. Admins edit it (saves on blur / Enter, Escape reverts);
// everyone else just sees it once it is set. Shown only for Ready for Invoice
// and Raised Invoice projects.
//
// variant: "card" (full-width box on a board card), "row" (compact, list
// view) or "header" (project page).
export function InvoiceNumberField({ project, canEdit, onSaved, variant = "card" }) {
  const saved = project?.invoice_number || "";
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => setText(saved), [saved]);

  if (!hasInvoiceSlot(project)) return null;

  // Inside clickable / draggable cards and rows: keep clicks, keys and drags
  // in the field from opening the project or starting a drag.
  const stop = (e) => e.stopPropagation();

  if (!canEdit) {
    if (!saved) return null;
    return (
      <span
        data-testid="invoice-number-readonly"
        className="inline-flex max-w-full items-center gap-1.5 self-start rounded-[8px] bg-[#e0f2fe] px-2.5 py-1 text-[12px] font-bold leading-4 tracking-[0.02em] text-[#075985]"
      >
        <Receipt className="h-[13px] w-[13px] shrink-0" />
        <span className="truncate">{saved}</span>
      </span>
    );
  }

  const save = async () => {
    const next = text.trim();
    if (next === saved) {
      if (next !== text) setText(next);
      return;
    }
    setBusy(true);
    try {
      const res = await setInvoiceNumber(project.id, next);
      const value = res?.invoice_number ?? next;
      setText(value);
      onSaved?.(project.id, value);
      toast.success(value ? "Invoice no. saved" : "Invoice no. cleared");
    } catch (err) {
      setText(saved);
      toast.error(err?.response?.data?.detail || "Could not save the invoice number");
    } finally {
      setBusy(false);
    }
  };

  const sizes = {
    card: "h-9 w-full text-[13px]",
    row: "h-8 w-full text-[12.5px]",
    header: "h-[34px] w-[282px] max-w-full text-[13px]",
  }[variant];

  return (
    <label
      onClick={stop}
      onMouseDown={stop}
      onDragStart={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`flex items-center gap-2 bg-white ${
        variant === "header" ? "rounded-[7px] px-3 shadow-[inset_0_0_0_1px_rgb(239,240,242)]" : "rounded-[8px] px-2.5 shadow-[inset_0_0_0_1px_#d6dbe3]"
      } transition-shadow focus-within:shadow-[inset_0_0_0_1px_#2b2bb5,0_0_0_3px_rgba(43,43,181,0.15)] ${sizes} ${
        busy ? "opacity-70" : ""
      }`}
    >
      <Receipt className="h-3.5 w-3.5 shrink-0 text-[#475569]" />
      {variant === "header" && (
        <span className="shrink-0 font-semibold text-[#0d1b3e]">Invoice no.</span>
      )}
      <input
        aria-label={`Invoice number for ${project.name}`}
        data-testid={`invoice-number-${project.id}`}
        value={text}
        maxLength={64}
        draggable={false}
        placeholder={variant === "header" ? "e.g. INV-2026-0142" : "Add invoice no."}
        onChange={(e) => setText(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setText(saved);
            const el = e.currentTarget;
            setTimeout(() => el.blur(), 0);
          }
        }}
        className="min-w-0 flex-1 border-none bg-transparent font-medium text-[#0f172a] outline-none placeholder:font-normal placeholder:text-[#64748b]"
      />
    </label>
  );
}
