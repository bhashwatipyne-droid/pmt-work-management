import { useLocation } from "react-router-dom";
import { Bell, User } from "lucide-react";

import { useUser } from "@/context/UserContext";
import { Sidebar } from "./Sidebar";

const CRUMBS = {
  "/": "Work Sheet",
  "/dashboard": "Dashboard",
  "/projects": "Projects",
  "/team": "Team",
  "/approvals": "Approvals",
  "/clients": "Clients",
};

const getInitials = (name) => {
  if (!name) return "U";

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
};

export const AppLayout = ({ children }) => {
  const { pathname } = useLocation();
  const { currentUser } = useUser();

  const crumb = CRUMBS[pathname] || "PMT";
  const initials = getInitials(currentUser?.name);

  return (
    <div className="flex h-screen bg-[#f7f9fc]">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          {/* Page title */}
          <span className="text-sm font-semibold text-slate-800">
            {crumb}
          </span>

          {/* Header actions */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="topbar-notifications"
              className={[
                "flex h-9 w-9 items-center justify-center",
                "rounded-lg",
                "text-slate-500",
                "transition-colors",
                "hover:bg-[#f0f0fd]",
                "hover:text-[#1a1a8a]",
                "focus:outline-none",
                "focus:ring-[3px]",
                "focus:ring-[#2b2bb5]/20",
              ].join(" ")}
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-label="User profile"
              title={currentUser?.name || "Profile"}
              className={[
                "flex h-9 w-9 items-center justify-center",
                "rounded-full",
                "bg-[#f0f0fd]",
                "text-xs font-semibold",
                "text-[#1a1a8a]",
                "transition-colors",
                "hover:bg-[#dcdcf8]",
                "focus:outline-none",
                "focus:ring-[3px]",
                "focus:ring-[#2b2bb5]/20",
              ].join(" ")}
            >
              {currentUser?.name ? (
                initials
              ) : (
                <User className="h-4 w-4" />
              )}
            </button>
          </div>
        </header>

        <main className="flex flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
};