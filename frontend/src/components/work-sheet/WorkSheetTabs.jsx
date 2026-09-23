import { cn } from "@/lib/utils";

const SHEETS = [
  { key: "Master", label: "All" },
  { key: "Content", label: "Content" },
  { key: "Design", label: "Design" },
  { key: "Animate", label: "Animation" },
];

// counts is optional — { [sheetKey]: number }. Omit it and the tabs
// render exactly as before, just without the trailing count.
export const WorkSheetTabs = ({ activeSheet, onChange, counts }) => {
  return (
    <div className="border-b border-border bg-card px-6">
      <div className="flex items-end gap-1">
        {SHEETS.map((sheet) => {
          const count = counts?.[sheet.key];
          const isActive = activeSheet === sheet.key;

          return (
            <button
              key={sheet.key}
              type="button"
              onClick={() => onChange(sheet.key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {sheet.label}
              {count != null && (
                <span
                  className={cn(
                    "text-xs",
                    isActive ? "text-muted-foreground" : "text-muted-foreground/70"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const WORKSHEET_SHEETS = SHEETS;