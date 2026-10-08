// "Task assigned to you" cards are for team members only: admins, managers and HR
// never see them. They still run on sample data until the assignment backend
// exists, so set REACT_APP_TASK_CARDS_DISABLED=true to switch them off without a
// code change.
export const showTaskCards = (user) =>
  user?.role === "member" && process.env.REACT_APP_TASK_CARDS_DISABLED !== "true";
