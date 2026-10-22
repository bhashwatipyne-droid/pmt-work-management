import { useCallback, useState } from "react";

// useState that survives leaving the page and coming back (e.g. opening a
// project from the Projects list and pressing Back). It is kept in
// sessionStorage, so it lasts for the browser tab only and a new tab or a new
// visit starts from `initial`. Storage can be missing or full, so every access
// is guarded and the value still works in memory.
export function useSessionState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw !== null) return JSON.parse(raw);
    } catch {
      /* fall through to the default */
    }
    return initial;
  });

  const set = useCallback(
    (next) => {
      setValue((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        try {
          sessionStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* keep it in memory only */
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, set];
}
