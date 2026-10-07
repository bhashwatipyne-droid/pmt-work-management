import { cn } from "@/lib/utils";

const SHEETS = [
  { key: "Master", label: "All" },
  { key: "Content", label: "Content" },
  { key: "Design", label: "Design" },
  { key: "Animate", label: "Animation" },
];

// counts is optional — { [sheetKey]: number }. Omit it and the tabs
// render exactly as before, just without the trailing count.
//
// Styled like the redesign: sits right under the title, a brand-blue underline
// marks the open sheet, and the counts are small and muted.
export const WorkSheetTabs = ({ activeSheet, onChange, counts }) => {
  return (
    <div
      role="tablist"
      aria-label="Sheets"
      className="flex items-center gap-1 bg-white px-5 shadow-[inset_0_-1px_0_#eaeef4]"
    >
      {SHEETS.map((sheet) => {
        const count = counts?.[sheet.key];
        const isActive = activeSheet === sheet.key;

        return (
          <button
            key={sheet.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(sheet.key)}
            className={cn(
              "flex h-[38px] items-center gap-1.5 px-2.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[#2b2bb5]/20",
              isActive
                ? "text-[#0d1b3e] shadow-[inset_0_-2px_0_#2b2bb5]"
                : "text-[#546490] hover:text-[#0d1b3e]"
            )}
          >
            {sheet.label}
            {count != null && (
              <span className="text-[11px] font-semibold leading-4 text-[#546490]">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export const WORKSHEET_SHEETS = SHEETS;