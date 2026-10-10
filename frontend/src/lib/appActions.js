// Lets the command palette ask a page to do something ("open the quick
// logger", "add a row") without the palette knowing about the page's state.
//
// If the page is already mounted its handler runs straight away. If the
// palette first has to navigate there, the action waits until the page
// registers itself, so it isn't lost.

const handlers = new Map();
const pending = new Map();

export const APP_ACTIONS = {
  QUICK_LOG: "quick-log",
  ADD_ROW: "add-row",
  SHOW_MISSING: "show-missing-deliverables",
};

// "Log work" on a shared project link opens the quick logger with that project
// already chosen. The preset waits (a person may have to sign in first) until the
// logger opens and the projects have loaded, and expires after half an hour.
const PRESET_MINUTES = 30;
let quickLogPreset = null;

export const setQuickLogPreset = (projectId) => {
  quickLogPreset = projectId ? { projectId, at: Date.now() } : null;
};

// The project to start the quick logger on, or null. Does not consume it.
export const peekQuickLogPreset = () =>
  quickLogPreset && Date.now() - quickLogPreset.at < PRESET_MINUTES * 60000
    ? quickLogPreset.projectId
    : null;

export const clearQuickLogPreset = () => {
  quickLogPreset = null;
};

export const requestAppAction = (name) => {
  const handler = handlers.get(name);
  if (handler) {
    handler();
  } else {
    pending.set(name, true);
  }
};

// Returns an unsubscribe function. Runs anything that was queued for `name`.
export const registerAppAction = (name, handler) => {
  handlers.set(name, handler);

  if (pending.has(name)) {
    pending.delete(name);
    // Let the page finish its first render before acting.
    setTimeout(handler, 0);
  }

  return () => {
    if (handlers.get(name) === handler) handlers.delete(name);
  };
};
