import { cn } from "@/lib/utils";

const SHEETS = [
  { key: "Master", label: "Master" },
  { key: "Content", label: "Content" },
  { key: "Design", label: "Design" },
  { key: "Animate", label: "Animation" },
  { key: "Finish", label: "Finish" },
];

export const WorkSheetTabs = ({ activeSheet, onChange }) => {
  return (
    <div className="border-b border-border bg-card px-4">
      <div className="flex items-end gap-1">
        {SHEETS.map((sheet) => (
          <button
            key={sheet.key}
            type="button"
            onClick={() => onChange(sheet.key)}
            className={cn(
              "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              activeSheet === sheet.key
                ? "border-teal-700 text-teal-800"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
            )}
          >
            {sheet.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export const WORKSHEET_SHEETS = SHEETS;