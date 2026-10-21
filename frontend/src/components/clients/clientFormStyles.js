export const inputBase =
  "w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20 disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-3.5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20 disabled:cursor-not-allowed disabled:opacity-60";

export const primaryButton =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#2b2bb5] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30 disabled:cursor-not-allowed disabled:bg-[#f0f0fd] disabled:text-[#c8d5ee]";


export const emptyContact = () => ({
  id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: "",
  designation: "",
  email: "",
  phone: "",
  isDraft: true,
});
