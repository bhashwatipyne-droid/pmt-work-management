import { CollaboratorPicker } from "../CollaboratorPicker";
import { Lock, UserPlus } from "lucide-react";
import { SearchableSelect } from "../SearchableSelect";
import { TableCell } from "@/components/ui/table";
import { WORKSHEET } from "@/constants/testIds";
import { avatarColorClasses } from "@/lib/avatarColors";

// The "Creator" cell of a Work Sheet row. `r` carries the row state and helpers.
export function renderCreatorCell(r) {
  const { NONE_VALUE, canEditExtra, canTagCollaborators, cellProps, collabCandidates, collabCount, collabRowReady, getCollabMemberIds, getInitials, item, lockedForMe, nameOf, nonAdminUsers, onAddCollaborators, onUpdate, openSelect, renderFillHandle, setOpenSelect, sheetCell } = r;
  const collaboratorButton = canTagCollaborators ? (
    <CollaboratorPicker
      people={collabCandidates}
      addedIds={getCollabMemberIds ? getCollabMemberIds(item.collab_group_id) : []}
      onSubmit={(ids) => onAddCollaborators([item.id], ids)}
      blockedReason={
        collabRowReady
          ? ""
          : "Fill in the date and the project, deliverable or type on this entry first, so teammates get something meaningful."
      }
      testId={`worksheet-collaborator-picker-${item.id}`}
    >
      <button
        type="button"
        tabIndex={-1}
        data-testid={`worksheet-collaborator-btn-${item.id}`}
        aria-label="Add collaborators"
        title={
          collabRowReady
            ? collabCount > 0
              ? `${collabCount} collaborator${collabCount === 1 ? "" : "s"} - click to add more`
              : "Add collaborators"
            : "Add collaborators"
        }
        className="inline-flex h-6 shrink-0 items-center justify-center gap-0.5 rounded-md px-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#2b2bb5] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
      >
        <UserPlus className="h-3.5 w-3.5" />
        {collabCount > 0 && (
          <span className="text-[11px] font-semibold text-[#2b2bb5]">+{collabCount}</span>
        )}
      </button>
    </CollaboratorPicker>
  ) : collabCount > 0 ? (
    <span
      className="inline-flex h-6 shrink-0 items-center rounded-md px-1 text-[11px] font-semibold text-[#2b2bb5]"
      title={`${collabCount} collaborator${collabCount === 1 ? "" : "s"} on this entry`}
    >
      +{collabCount}
    </span>
  ) : null;

  return (
<TableCell {...cellProps(11)}>
  {canEditExtra ? (
    <div className="flex min-w-0 items-center gap-1">
    <div className="min-w-0 flex-1">
    <SearchableSelect
        open={openSelect === "creator"}
        onOpenChange={(open) => setOpenSelect(open ? "creator" : null)}
        value={item.creator_id || NONE_VALUE}
        onValueChange={(v) => onUpdate(item.id, { creator_id: v === NONE_VALUE ? null : v })}
        options={[
          { value: NONE_VALUE, label: "Unassigned" },
          ...nonAdminUsers.map((user) => ({ value: user.id, label: user.name })),
        ]}
        placeholder="Creator"
        searchPlaceholder="Type creator name..."
        emptyText="No users found"
        disabled={!canEditExtra}
        triggerProps={sheetCell(11)}
        data-testid={`${WORKSHEET.creatorSelect}-${item.id}`}
        contentClassName="w-[280px] p-0"
        renderValue={(option) => {
          const name = option?.label || "Unassigned";
          const initials = getInitials(name);

          return (
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColorClasses(option?.value)}`}
              >
                {initials}
              </span>
              <span className="min-w-0 truncate text-[13px] leading-5 text-slate-700">{name}</span>
            </span>
          );
        }}
      />
    </div>
    {collaboratorButton}
    </div>
  ) : (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${avatarColorClasses(item.creator_id)}`}
      >
        {getInitials(nameOf(item.creator_id))}
      </span>
      <span className="cell-plain min-w-0">{nameOf(item.creator_id)}</span>
      {lockedForMe && (
        <Lock
          className="h-3 w-3 shrink-0 text-muted-foreground"
          aria-label="Locked"
          title={`This row was created by ${nameOf(item.creator_id)}. Only they (or a manager) can edit it.`}
        />
      )}
      {collaboratorButton && <span className="ml-auto shrink-0">{collaboratorButton}</span>}
    </span>
  )}
  {renderFillHandle(11)}
</TableCell>
  );
}
