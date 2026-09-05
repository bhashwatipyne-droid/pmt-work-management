import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";

import {
  LayoutDashboard,
  Megaphone,
  Users,
  CheckSquare,
  Building2,
  Table2,
  LogOut,
  Layers,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { useUser } from "@/context/UserContext";
import { LAYOUT } from "@/constants/testIds";

const navItemClass = ({ isActive }) =>
  `flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? "bg-white text-[#1a1a8a] shadow-sm"
      : "text-slate-300 hover:bg-white/10 hover:text-white"
  }`;

export const Sidebar = () => {
  const { currentUser, logout } = useUser();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem("pmt_sidebar_collapsed") === "true";
  });

  const isAdmin = currentUser?.role === "admin";
  const initial = (currentUser?.name || "?").trim().charAt(0).toUpperCase();

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("pmt_sidebar_collapsed", String(next));
      return next;
    });
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <aside
      className={`relative flex flex-shrink-0 flex-col bg-[#10172a] border-r border-white/10 px-4 py-5 transition-all duration-200 ${
        collapsed ? "w-20" : "w-60"
      }`}
    >
      {/* Collapse / Expand */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-7 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Logo */}
      <div
        className={`mb-7 flex items-center ${
          collapsed ? "justify-center" : "gap-2.5 px-1"
        }`}
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-indigo-500/90">
          <Layers className="h-4 w-4 text-white" />
        </div>

        {!collapsed && (
          <div className="text-[15px] font-semibold tracking-tight text-white">
            PMT
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-1">
        {isAdmin && (
          <NavLink
            to="/dashboard"
            data-testid={LAYOUT.sidebarNavDashboard}
            className={({ isActive }) =>
              `${navItemClass({ isActive })} ${
                collapsed ? "justify-center px-2" : "gap-3 px-3"
              }`
            }
            title={collapsed ? "Dashboard" : undefined}
          >
            <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
            {!collapsed && "Dashboard"}
          </NavLink>
        )}

        {isAdmin && (
          <NavLink
            to="/projects"
            data-testid="sidebar-nav-projects"
            className={({ isActive }) =>
              `${navItemClass({ isActive })} ${
                collapsed ? "justify-center px-2" : "gap-3 px-3"
              }`
            }
            title={collapsed ? "Projects" : undefined}
          >
            <Megaphone className="h-4 w-4 flex-shrink-0" />
            {!collapsed && "Projects"}
          </NavLink>
        )}

        {isAdmin && (
          <NavLink
            to="/team"
            data-testid="sidebar-nav-team"
            className={({ isActive }) =>
              `${navItemClass({ isActive })} ${
                collapsed ? "justify-center px-2" : "gap-3 px-3"
              }`
            }
            title={collapsed ? "Team" : undefined}
          >
            <Users className="h-4 w-4 flex-shrink-0" />
            {!collapsed && "Team"}
          </NavLink>
        )}

        {(isAdmin || currentUser?.role === "manager") && (
          <NavLink
            to="/approvals"
            data-testid="sidebar-nav-approvals"
            className={({ isActive }) =>
              `${navItemClass({ isActive })} ${
                collapsed ? "justify-center px-2" : "gap-3 px-3"
              }`
            }
            title={collapsed ? "Approvals" : undefined}
          >
            <CheckSquare className="h-4 w-4 flex-shrink-0" />
            {!collapsed && "Approvals"}
          </NavLink>
        )}

        {isAdmin && (
          <NavLink
            to="/clients"
            data-testid="sidebar-nav-clients"
            className={({ isActive }) =>
              `${navItemClass({ isActive })} ${
                collapsed ? "justify-center px-2" : "gap-3 px-3"
              }`
            }
            title={collapsed ? "Clients" : undefined}
          >
            <Building2 className="h-4 w-4 flex-shrink-0" />
            {!collapsed && "Clients"}
          </NavLink>
        )}

        <NavLink
          to="/"
          data-testid={LAYOUT.sidebarNavSheet}
          className={({ isActive }) =>
            `${navItemClass({ isActive })} ${
              collapsed ? "justify-center px-2" : "gap-3 px-3"
            }`
          }
          title={collapsed ? "Work Sheet" : undefined}
        >
          <Table2 className="h-4 w-4 flex-shrink-0" />
          {!collapsed && "Work Sheet"}
        </NavLink>
      </nav>

      {/* User */}
      <div className="mt-auto border-t border-white/10 pt-6">
        {currentUser && (
          <div
            data-testid={LAYOUT.sidebarUserInfo}
            className={`mb-3 flex items-center ${
              collapsed ? "justify-center" : "gap-2.5 px-1"
            }`}
          >
            <div
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-600 text-sm font-medium text-white"
              title={collapsed ? currentUser.name : undefined}
            >
              {initial}
            </div>

            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-white">
                  {currentUser.name}
                </div>
                <div className="truncate text-xs capitalize text-slate-400">
                  {currentUser.role}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          data-testid="sidebar-logout-btn"
          onClick={handleLogout}
          title={collapsed ? "Logout" : undefined}
          className={`flex w-full items-center rounded-md bg-slate-800/60 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 ${
            collapsed ? "justify-center px-2" : "justify-center gap-2 px-3"
          }`}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          {!collapsed && "Logout"}
        </button>
      </div>
    </aside>
  );
};