// "Looks like ..." warnings can be dismissed per project. The choice is kept
// in this browser and shared by the project page banner and the board/list
// chips, so dismissing it in one place hides it everywhere.
const key = (id) => `pmt-lookalike-dismissed:${id}`;
const EVENT = "pmt-lookalike-dismissed";

export const isLookalikeDismissed = (id) => {
  try {
    return localStorage.getItem(key(id)) === "1";
  } catch {
    return false;
  }
};

export const dismissLookalike = (id) => {
  try {
    localStorage.setItem(key(id), "1");
  } catch {
    /* hidden until the page reloads */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
};

export const onLookalikeDismissed = (fn) => {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
};
