import { forwardRef } from "react";
import { Download } from "lucide-react";

// Icon-only Export button - the same Download icon the Efficiency page's
// "Export" button uses, with no text. The label lives in aria-label and the
// hover tooltip so it stays accessible.
//
// Size and border radius come from `className`, so each page can match the
// controls around it (Projects uses 34px controls, the Work sheet 36px).
export const ExportIconButton = forwardRef(function ExportIconButton(
  { label = "Export", className = "", disabled = false, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={disabled ? `${label} (nothing to export)` : label}
      disabled={disabled}
      className={[
        "inline-flex shrink-0 items-center justify-center border bg-white outline-none transition-colors",
        "focus-visible:ring-[3px] focus-visible:ring-[#2b2bb5]/20",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white",
        className,
      ].join(" ")}
      {...props}
    >
      <Download className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
});

export default ExportIconButton;