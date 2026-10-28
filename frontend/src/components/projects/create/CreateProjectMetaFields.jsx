import { PROJECTS } from "@/constants/testIds";
import { PROJECT_STATUSES } from "@/constants/projectPalette";
import { fieldBase } from "@/components/projects/createProjectLogic";

export function CreateProjectMetaFields(ctx) {
  const { availablePocs, endDate, pocId, selectedClient, setEndDate, setPocId, setStartDate, setStatus, startDate, status } = ctx;
  return (
    <>
    {/* Status / POC / dates */}
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-700">
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldBase}>
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-700">
        Point of contact
        <select
          value={pocId}
          onChange={(e) => setPocId(e.target.value)}
          disabled={!selectedClient}
          className={fieldBase}
        >
          <option value="">
            {!selectedClient ? "Choose a client first" : availablePocs.length ? "Choose POC" : "No POCs yet"}
          </option>
          {availablePocs.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-700">
        Start date *
        <input
          type="date"
          data-testid={PROJECTS.fieldStart}
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className={fieldBase}
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-slate-700">
        End date *
        <input
          type="date"
          data-testid={PROJECTS.fieldEnd}
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className={fieldBase}
        />
      </label>
    </div>
    </>
  );
}
