import { useCallback, useEffect, useState } from "react";

import { useUser } from "@/context/UserContext";

// Pinned projects live in this browser only (per signed-in user); there is
// no server-side model for them. Each pin stores just what the sidebar needs
// to draw it.
const MAX_PINS = 8;
const EVENT = "pmt:pinned-projects";

const storageKey = (userId) => `pmt_pinned_projects:${userId || "anon"}`;

const read = (userId) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const usePinnedProjects = () => {
  const { currentUserId } = useUser();
  const [pins, setPins] = useState(() => read(currentUserId));

  useEffect(() => {
    setPins(read(currentUserId));

    const sync = () => setPins(read(currentUserId));
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [currentUserId]);

  const write = useCallback(
    (next) => {
      try {
        localStorage.setItem(storageKey(currentUserId), JSON.stringify(next));
      } catch {
        // Storage can be unavailable (private mode); pins just won't persist.
      }
      setPins(next);
      window.dispatchEvent(new Event(EVENT));
    },
    [currentUserId]
  );

  const isPinned = useCallback(
    (projectId) => pins.some((pin) => pin.id === projectId),
    [pins]
  );

  const togglePin = useCallback(
    (project) => {
      if (!project?.id) return false;

      if (pins.some((pin) => pin.id === project.id)) {
        write(pins.filter((pin) => pin.id !== project.id));
        return false;
      }

      const entry = { id: project.id, name: project.name, status: project.status };
      write([entry, ...pins].slice(0, MAX_PINS));
      return true;
    },
    [pins, write]
  );

  return { pins, isPinned, togglePin };
};
