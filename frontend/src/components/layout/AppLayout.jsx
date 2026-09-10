import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Bug, User, X } from "lucide-react";

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
  const [showBugReport, setShowBugReport] = useState(false);

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
              onClick={() => setShowBugReport(true)}
              className={[
                "inline-flex h-9 items-center gap-2",
                "rounded-lg",
                "bg-[#2b2bb5] px-4",
                "text-xs font-semibold text-white",
                "shadow-sm",
                "transition-all",
                "hover:bg-[#23239a]",
                "hover:shadow-md",
                "focus:outline-none",
                "focus:ring-[3px]",
                "focus:ring-[#2b2bb5]/25",
              ].join(" ")}
            >
              <Bug className="h-4 w-4" />
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

      {showBugReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onMouseDown={() => setShowBugReport(false)}
        >
          <div
            className="relative flex h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-5">
              <div className="flex items-center gap-2">
                <Bug className="h-4 w-4 text-[#2b2bb5]" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Report a bug
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setShowBugReport(false)}
                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <iframe
              src="https://docs.google.com/forms/d/e/1FAIpQLScNFMcRUNMpf25VwBQQjV0uN9pCWqblp5gt-txVqivFQmQ_iw/viewform?embedded=true"
              title="Report a bug"
              className="min-h-0 flex-1 w-full border-0"
            />
          </div>
        </div>
      )}
    </div>
  );
};