import { useMemo } from "react";

import { useUser } from "@/context/UserContext";
import { getAccess } from "@/lib/permissions";

// The current user's capabilities (see lib/permissions.js).
export const useAccess = () => {
  const { currentUser } = useUser();
  return useMemo(() => getAccess(currentUser), [currentUser]);
};
