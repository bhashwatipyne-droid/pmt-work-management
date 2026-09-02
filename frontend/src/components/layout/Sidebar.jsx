import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Megaphone, Users, CheckSquare, Building2, Table2, LogOut, Layers } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { LAYOUT } from "@/constants/testIds";

const navItemClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? "bg-white/[0.06] text-indigo-300"
      : "text-slate-400 hover:bg-white/[0.03] hover:text-slate-100"
  }`;

export const Sidebar = () => {
  const { currentUser, logout } = useUser();
  const navigate = useNavigate();
  const isAdmin = currentUser?.role === "admin";
  const initial = (currentUser?.name || "?").trim().charAt(0).toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <aside className="flex w-60 flex-shrink-0 flex-col bg-[#0b1e39] px-4 py-5">
      <div className="mb-7 flex items-center gap-2.5 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-500/90">
          <Layers className="h-4 w-4 text-white" />
        </div>
        <div className="text-[15px] font-semibold tracking-tight text-white">
          PMT <span className="text-slate-400 font-normal">Prototype</span>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {isAdmin && (
          <NavLink to="/dashboard" data-testid={LAYOUT.sidebarNavDashboard} className={navItemClass}>
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/projects" data-testid="sidebar-nav-projects" className={navItemClass}>
            <Megaphone className="h-4 w-4" />
            Projects
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/team" data-testid="sidebar-nav-team" className={navItemClass}>
            <Users className="h-4 w-4" />
            Team
          </NavLink>
        )}
        {(isAdmin || currentUser?.role === "manager") && (
          <NavLink to="/approvals" data-testid="sidebar-nav-approvals" className={navItemClass}>
            <CheckSquare className="h-4 w-4" />
            Approvals
          </NavLink>
        )}
        {isAdmin && (
          <NavLink to="/clients" data-testid="sidebar-nav-clients" className={navItemClass}>
            <Building2 className="h-4 w-4" />
            Clients
          </NavLink>
        )}
        <NavLink to="/" data-testid={LAYOUT.sidebarNavSheet} className={navItemClass}>
          <Table2 className="h-4 w-4" />
          Work Sheet
        </NavLink>
      </nav>

      <div className="mt-auto pt-6">
        {currentUser && (
          <div data-testid={LAYOUT.sidebarUserInfo} className="mb-3 flex items-center gap-2.5 px-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-600 text-sm font-medium text-white">
              {initial}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-white">{currentUser.name}</div>
              <div className="truncate text-[11px] capitalize text-slate-400">{currentUser.role}</div>
            </div>
          </div>
        )}
        <button
          data-testid="sidebar-logout-btn"
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-800/60 px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </aside>
  );
};
