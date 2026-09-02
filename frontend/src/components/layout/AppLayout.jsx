import { useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import { Sidebar } from "./Sidebar";

const CRUMBS = {
  "/": "Work Sheet",
  "/dashboard": "Dashboard",
  "/projects": "Projects",
  "/team": "Team",
  "/approvals": "Approvals",
  "/clients": "Clients",
};

export const AppLayout = ({ children }) => {
  const { pathname } = useLocation();
  const crumb = CRUMBS[pathname] || "PMT";

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <span className="text-sm text-slate-500">{crumb}</span>
          <div className="flex items-center gap-3">
            <button
              data-testid="topbar-notifications"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200"
            >
              <Bell className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </div>
  );
};
