// Shared row-edit permission logic for the Work Sheet.
//
// Admin = view-only.
// Member = own rows only.
// Manager = own department's rows only.
//
// Migrated work items may contain the creator's name instead of their
// current user ID, so we resolve the creator by ID first and then by name.

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

  return (
    !!currentUser.department &&
    creator?.department === currentUser.department
  );
};