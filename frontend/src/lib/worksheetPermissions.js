// Shared row-edit permission logic for the Work Sheet.
// Admin = view-only. Member = own rows only. Manager = own department's rows only.
export const canEditWorkItem = (currentUser, item, users) => {
  if (!currentUser) return false;
  if (currentUser.role === "admin") return false;
  if (currentUser.role === "member") return item.creator_id === currentUser.id;
  const creator = users.find((u) => u.id === item.creator_id);
  return !!currentUser.department && creator?.department === currentUser.department;
};
