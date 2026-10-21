import { Briefcase, ChevronRight, X } from "lucide-react";
import { PROJECTS } from "@/constants/testIds";

export function CreateProjectHeader(ctx) {
  const { handleClose } = ctx;
  return (
    <>
    {/* Header: breadcrumb + close */}
    <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-6 py-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f0f0fd] text-[#2b2bb5]">
        <Briefcase className="h-4 w-4" />
      </span>
      <span className="flex flex-1 items-center gap-1.5 text-sm text-muted-foreground">
        Projects
        <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
        <span className="font-semibold text-foreground">New project</span>
      </span>
      <button
        type="button"
        data-testid={PROJECTS.modalClose}
        onClick={handleClose}
        aria-label="Close"
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-slate-50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
    </>
  );
}
