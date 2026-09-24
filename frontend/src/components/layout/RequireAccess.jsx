import { Link, useLocation } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { useAccess } from "@/hooks/useAccess";
import { canAccessPath, getRouteRule } from "@/lib/permissions";

// Route guard driven by lib/permissions.js. A page the role can't open shows
// this instead, so a typed-in URL or an old bookmark doesn't fire requests
// that would only come back 403.
export const RequireAccess = ({ children }) => {
  const { pathname } = useLocation();
  const access = useAccess();

  if (canAccessPath(access, pathname)) return children;

  const label = getRouteRule(pathname)?.label || "This page";

  return (
    <div
      data-testid="access-denied"
      className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
    >
      <p className="text-sm font-medium text-foreground">
        {label} isn&apos;t available for your role
      </p>

      <Link
        to="/"
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-[#2b2bb5] transition-colors hover:bg-[#f0f0fd] hover:text-[#1a1a8a]"
      >
        Go to Work sheet
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
};
