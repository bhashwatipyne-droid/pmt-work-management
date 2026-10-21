import { FollowUpPicker, OptionList, PeoplePicker } from "@/components/work-sheet/projects-sheet/SheetPickers";
import { NONE, isStakeholder } from "@/components/work-sheet/projects-sheet/sheetColumns";
import { StatusBadge } from "@/components/work-sheet/projects-sheet/SheetBits";
import { toast } from "sonner";

export function pickerFor(ctx, t, col) {
  const { activeUsers, clients, focusGrid, options, save, setMenu } = ctx;
  const close = () => {
    setMenu(null);
    requestAnimationFrame(focusGrid);
  };
  if (col.key === "type")
    return (
      <OptionList
        value={t.task_type || ""}
        options={[{ value: "", label: "No type" }, ...(options.task_types || []).map((o) => ({ value: o, label: o }))]}
        onPick={(v) => {
          save(t, { task_type: v });
          close();
        }}
      />
    );
  if (col.key === "status")
    return (
      <OptionList
        value={t.status}
        options={(options.statuses || []).map((s) => ({ value: s, label: s, render: <StatusBadge status={s} /> }))}
        onPick={(v) => {
          save(t, { status: v }).then(() => v === "Done" && t.status !== "Done" && toast(`Done: ${t.task || "Untitled task"}`));
          close();
        }}
      />
    );
  if (col.key === "client")
    return (
      <OptionList
        searchable
        value={t.client_id || NONE}
        options={[{ value: NONE, label: "Internal · no client" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]}
        onPick={(v) => {
          save(t, { client_id: v === NONE ? null : v });
          close();
        }}
      />
    );
  if (col.key === "owner")
    return (
      <PeoplePicker
        task={t}
        users={activeUsers.filter(isStakeholder)}
        onSave={(f) => save(t, f)}
      />
    );
  if (col.key === "followup")
    return <FollowUpPicker task={t} users={activeUsers} teams={options.teams || []} onSave={(f) => save(t, f)} />;
  return null;
}
