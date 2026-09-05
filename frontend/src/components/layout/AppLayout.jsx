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
    <div className="flex h-screen bg-slate-50">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <span className="text-sm text-slate-500">{crumb}</span>

          <div className="flex items-center gap-2">
            <button
              data-testid="topbar-notifications"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-label="User profile"
              title={currentUser?.name || "Profile"}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white transition-colors hover:bg-teal-800"
            >
              {currentUser?.name ? initials : <User className="h-4 w-4" />}
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