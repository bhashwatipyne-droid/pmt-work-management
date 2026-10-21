import { format, parseISO } from "date-fns";

export const emptyDraftDeliverable = () => ({
  id: null,
  name: "",
  type: "",
  stage_schedule: {},
  required_stages: ["Content"],
  approval_types: [],
});

export const fieldBase =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-white px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20";

export const smallButton =
  "inline-flex h-7 items-center whitespace-nowrap rounded-md border border-border bg-white px-2.5 text-xs font-semibold text-foreground hover:bg-slate-50";

export const fmtDue = (date) => {
  if (!date) return "no end date";
  try {
    return `due ${format(parseISO(date), "dd MMM yyyy")}`;
  } catch {
    return `due ${date}`;
  }
};
