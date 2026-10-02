// Shared row-edit permission logic for the Work Sheet.
//
// Admin = view-only.
// Member = own rows only.
// Manager = own department's rows only.
//
// Migrated work items may contain the creator's name instead of their
// current user ID, so we resolve the creator by ID first and then by name.

// A row with a named creator - not the acting member, and not a
// manager/admin-provisioned shared row (see "Add N Rows", which leaves
// creator_id empty) - is locked for everyone but that person, regardless of
// whether the creator is a member, manager, or admin. Mirrors the backend's
// scoped_update_fields peer-lock exactly, so the UI never lets someone start
// an edit the server would then reject.
const MANAGER_STAGE_BY_DEPARTMENT = {
  Content: "Content",
  Design: "Design",
  Animation: "Animate",
};

export const isRowLockedForMember = (currentUser, item, users = []) => {
  if (!currentUser || currentUser.role !== "member") return false;

  const creatorId = item?.creator_id;
  if (!creatorId || creatorId === currentUser.id) return false;

  return true;
};

export const canEditWorkItem = (currentUser, item, users = []) => {
  if (!currentUser || !item) return false;

  // Admins are view-only.
  if (currentUser.role === "admin") return false;

  // Members can edit their own rows.
  if (currentUser.role === "member") {
    return (
      item.creator_id === currentUser.id ||
      item.creator_id === currentUser.name
    );
  }

  // Managers can edit rows created by someone in their department.
  const creator =
    users.find((user) => user.id === item.creator_id) ||
    users.find(
      (user) =>
        user.name &&
        item.creator_id &&
        user.name.trim().toLowerCase() ===
          String(item.creator_id).trim().toLowerCase()
    );

  if (!currentUser.department) return false;

  // A row nobody has been named on yet (e.g. blank rows added before managers
  // owned the rows they add) belongs to whoever works its stage, so a manager
  // of that stage can edit it - mainly to pick its creator. Mirrors the
  // backend's scoped_update_fields.
  const ownStage = MANAGER_STAGE_BY_DEPARTMENT[currentUser.department];
  if (!item.creator_id && ownStage && (!item.stage || item.stage === ownStage)) {
    return true;
  }

  return creator?.department === currentUser.department;
};