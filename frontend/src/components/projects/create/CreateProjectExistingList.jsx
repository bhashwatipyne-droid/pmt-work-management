import { PROJECT_STATUS_STYLE } from "@/constants/projectPalette";
import { fmtDue } from "@/components/projects/createProjectLogic";

export function CreateProjectExistingList(ctx) {
  const { clientProjects, nameState, openProject, selectedClient } = ctx;
  return (
    <>
    {/* The client's projects, while no name is typed yet */}
    {selectedClient && nameState === "empty" && (
      <div className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-foreground">
          Existing projects for {selectedClient.name} · {clientProjects.length}
        </span>
        {clientProjects.length ? (
          <div className="flex flex-col overflow-hidden rounded-[10px] border border-border">
            {clientProjects.slice(0, 5).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => openProject(p)}
                className="flex min-h-10 items-center gap-2.5 border-b border-slate-100 bg-white px-3 text-left last:border-b-0 hover:bg-slate-50"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: PROJECT_STATUS_STYLE[p.status]?.dot || "#8a93a2" }}
                />
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {p.status} · {fmtDue(p.end_date)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <span className="text-[13px] text-muted-foreground">No projects yet for this client.</span>
        )}
      </div>
    )}
    </>
  );
}
