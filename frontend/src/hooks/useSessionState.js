import { useCallback, useState } from "react";

// The app's one answer to "this screen forgot what I was doing".
//
// useSessionState is useState that survives leaving a screen and coming back
// (switching Work sheet tabs, opening a project and pressing Back, moving to
// another page and returning). Values live in sessionStorage, so they last for
// the browser tab only: a new tab or a new visit starts from `initial`, and
// logging out wipes them (clearSessionState). Only JSON-able values can be
// kept, so use arrays / plain objects instead of Sets.
//
// Use it for view state a person would be annoyed to lose: search text,
// filters, tabs, sort, group-by, which groups are open, a chosen month. Do not
// use it for data fetched from the server or for open dialogs.
//
// Storage can be missing or full, so every access is guarded and the value
// still works in memory.

const PREFIX = "pmt-ui:";

export const readSessionState = (key, fallback) => {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (raw !== null) return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  return fallback;
};

export const hasSessionState = (key) => {
  try {
    return sessionStorage.getItem(PREFIX + key) !== null;
  } catch {
    return false;
  }
};

export const writeSessionState = (key, value) => {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* keep it in memory only */
  }
};

// Called on logout so the next person on this tab starts clean.
export const clearSessionState = () => {
  try {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* nothing to clear */
  }
};

export function useSessionState(key, initial) {
  const [value, setValue] = useState(() => {
    const stored = readSessionState(key, undefined);
    if (stored !== undefined) return stored;
    return typeof initial === "function" ? initial() : initial;
  });

  const set = useCallback(
    (next) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        writeSessionState(key, resolved);
        return resolved;
      });
    },
    [key]
  );

  return [value, set];
}
