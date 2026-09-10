import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Bug, User } from "lucide-react";

import { useUser } from "@/context/UserContext";
import { Sidebar } from "./Sidebar";

const CRUMBS = {
  "/": "Work Sheet",
  "/dashboard": "Dashboard",
  "/projects": "Projects",
  "/team": "Team",
  "/approvals": "Approvals",
  "/clients": "Clients",
  "/profile": "Profile & Account",
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
  const navigate = useNavigate();
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
              onClick={() => {
                window.location.href =
                  "mailto:YOUR_EMAIL@example.com?subject=PMT%20Bug%20Report";
              }}
              className={[
                "inline-flex h-9 items-center gap-1.5",
                "rounded-lg border border-slate-200",
                "bg-white px-3",
                "text-xs font-medium text-slate-600",
                "transition-colors",
                "hover:bg-slate-50 hover:text-slate-900",
                "focus:outline-none",
                "focus:ring-[3px]",
                "focus:ring-[#2b2bb5]/20",
              ].join(" ")}
            >
              <Bug className="h-3.5 w-3.5" />
              Report a bug
            </button>
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
              onClick={() => navigate("/profile")}
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