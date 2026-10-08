// Task cards run on sample data until the assignment backend exists, so they must
// not pop up for the whole team on the live site. They show for Admin accounts
// (to review the design), and for anyone who turns the preview on:
//   localStorage.setItem("pmt_task_cards_preview", "1")   (then reload)
// or by building with REACT_APP_TASK_CARDS_PREVIEW=true.
export const showTaskCards = (user) => {
  if (!user || user.role === "hr") return false;
  if (user.role === "admin") return true;
  if (process.env.REACT_APP_TASK_CARDS_PREVIEW === "true") return true;
  try {
    return localStorage.getItem("pmt_task_cards_preview") === "1";
  } catch {
    return false;
  }
};
