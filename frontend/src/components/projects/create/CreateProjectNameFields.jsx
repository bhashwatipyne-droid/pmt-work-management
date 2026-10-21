import { PROJECTS } from "@/constants/testIds";
import { fieldBase } from "@/components/projects/createProjectLogic";

export function CreateProjectNameFields(ctx) {
  const { description, name, nameState, nameUnderline, setConfirmed, setDescription, setName } = ctx;
  return (
    <>
    {/* Name */}
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-700">Project name</span>
      <input
        data-testid={PROJECTS.fieldName}
        aria-label="Project name"
        type="text"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setConfirmed(false);
        }}
        placeholder="e.g. Senior Citizen Campaign"
        className={`h-12 border-none bg-transparent px-0.5 text-2xl font-semibold tracking-tight text-foreground outline-none transition-shadow placeholder:text-muted-foreground/60 ${nameUnderline}`}
      />
    </label>

    {/* Description */}
    <label className="-mt-1.5 flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-700">What is this project for?</span>
      <input
        aria-label="Project description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="One line the team will see when picking a project, e.g. Oct 2026 edition, Gujarati versions"
        className={fieldBase}
      />
      {nameState === "similar" && (
        <span className="text-xs text-amber-800">
          A similar project exists. Add what makes this one different, like the year, language or product.
        </span>
      )}
    </label>
    </>
  );
}
