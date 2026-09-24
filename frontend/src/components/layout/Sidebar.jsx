import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Bug,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  LogOut,
  Search,
  User,
} from "lucide-react";

import { useUser } from "@/context/UserContext";
import { useAccess } from "@/hooks/useAccess";
import { usePinnedProjects } from "@/hooks/usePinnedProjects";
import { LAYOUT } from "@/constants/testIds";
import { STATUS_COLORS } from "@/constants/projectPalette";
import { ROLE_LABELS } from "@/lib/permissions";
import { startPolling } from "@/lib/polling";
import { onCountsRefresh } from "@/lib/countsBus";
import {
  getApprovalsPendingCount,
  getWorkItemsPendingCount,
} from "@/services/api";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import { useCommandCenter } from "./CommandCenter";
import {
  BUG_REPORT_URL,
  getNavSections,
  IS_MAC,
} from "./navItems";

// Background safety-net cadence for the sidebar's badge counts, in case
// they were changed by someone else / another tab. Anything the current
// user does themselves refreshes instantly via the countsBus event. It
// pauses while the tab is hidden and refreshes when visible again
// (see startPolling).
const COUNT_POLL_MS = 15000;

const SECTION_TITLE =
  "px-2 pb-1.5 text-[11px] font-bold uppercase leading-[14px] tracking-[0.05em] text-[#546490]";

// Design: the Work sheet count is a soft red pill, Approvals a solid brand
// pill. Anything above 99 reads "99+".
const CountPill = ({ count, tone, className = "" }) => {
  if (!count || count <= 0) return null;

  return (
    <span
      className={[
        "inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-[18px]",
        tone === "brand"
          ? "bg-[#2b2bb5] text-white"
          : "bg-[#fff5f5] text-[#ef4444]",
        className,
      ].join(" ")}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
};

export const Sidebar = () => {
  const { currentUser, logout } = useUser();
  const access = useAccess();
  const navigate = useNavigate();
  const { openPalette, openHelp } = useCommandCenter();
  const { pins } = usePinnedProjects();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("pmt_sidebar_collapsed") === "true"
  );
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [approvalsCount, setApprovalsCount] = useState(0);
  const [worksheetCount, setWorksheetCount] = useState(0);
  const helpButtonRef = useRef(null);

  const initial = (currentUser?.name || "?").trim().charAt(0).toUpperCase();
  const sections = getNavSections(access);
  const canSeeApprovals = access.canViewApprovals;

  useEffect(() => {
    if (!currentUser?.id) return undefined;

    let cancelled = false;

    const fetchCounts = () => {
      getWorkItemsPendingCount(currentUser.id)
        .then((data) => !cancelled && setWorksheetCount(data?.count || 0))
        .catch(() => {});

      if (canSeeApprovals) {
        getApprovalsPendingCount(currentUser.id)
          .then((data) => !cancelled && setApprovalsCount(data?.count || 0))
          .catch(() => {});
      }
    };

    fetchCounts();
    const stopPolling = startPolling(fetchCounts, COUNT_POLL_MS);
    const unsubscribe = onCountsRefresh(fetchCounts);

    return () => {
      cancelled = true;
      stopPolling();
      unsubscribe();
    };
  }, [currentUser?.id, canSeeApprovals]);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("pmt_sidebar_collapsed", String(next));
      return next;
    });
  };

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    navigate("/");
  };

  const openHelpNearButton = () => {
    const rect = helpButtonRef.current?.getBoundingClientRect();
    openHelp(
      rect
        ? { left: rect.right + 8, bottom: window.innerHeight - rect.bottom }
        : null
    );
  };

  const countFor = (key) =>
    key === "worksheet" ? worksheetCount : key === "approvals" ? approvalsCount : 0;
  const toneFor = (key) => (key === "approvals" ? "brand" : "error");

  const footerButton =
    "flex h-8 w-full items-center rounded-[7px] text-[13px] text-slate-600 transition-colors hover:bg-[#f3f4f6]";

  return (
    <aside
      className={`relative flex shrink-0 flex-col bg-[#f5f6f8] shadow-[inset_-1px_0_0_rgb(226,232,240)] transition-all duration-200 ${
        collapsed ? "w-[68px]" : "w-[236px]"
      }`}
    >
      {/* Collapse / expand */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-[14px] z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-800"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Logo + notifications */}
      <div
        className={`flex h-[52px] shrink-0 items-center ${
          collapsed ? "justify-center" : "gap-2.5 pl-4 pr-3"
        }`}
      >
        <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[#2b2bb5] text-xs font-bold tracking-tight text-white">
          P
        </div>

        {!collapsed && (
          <>
            <div className="flex-1 text-[15px] font-bold tracking-tight text-slate-900">
              PMT
            </div>
            <NotificationCenter placement="sidebar" />
          </>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center pb-1">
          <NotificationCenter placement="sidebar" />
        </div>
      )}

      {/* Search / jump to */}
      <div className={`flex flex-col gap-1.5 pb-3 pt-1 ${collapsed ? "px-2" : "px-3"}`}>
        <button
          type="button"
          onClick={openPalette}
          data-testid="sidebar-search"
          title={collapsed ? "Search or jump to" : undefined}
          className={`flex h-8 items-center rounded-[7px] bg-white text-[13px] text-[#546490] shadow-[inset_0_0_0_1px_rgb(234,238,244)] transition-shadow hover:shadow-[inset_0_0_0_1px_rgb(209,213,219)] ${
            collapsed ? "justify-center" : "gap-2 px-2 text-left"
          }`}
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1">Search or jump to</span>
              <span className="inline-flex h-[18px] items-center rounded bg-[#f5f6f8] px-[5px] text-[10px] font-semibold text-[#546490]">
                {IS_MAC ? "⌘K" : "Ctrl K"}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex flex-1 flex-col gap-[18px] overflow-y-auto py-1 ${collapsed ? "px-2" : "px-3"}`}>
        {sections.map((section) => (
          <div key={section.title} className="flex flex-col gap-0.5">
            {!collapsed && <div className={SECTION_TITLE}>{section.title}</div>}

            {section.items.map((item) => {
              const Icon = item.icon;
              const count = countFor(item.key);

              return (
                <NavLink
                  key={item.key}
                  to={item.to}
                  end={item.to === "/"}
                  data-testid={item.testId}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    [
                      "flex h-8 items-center rounded-[7px] text-sm font-medium transition-colors",
                      collapsed ? "justify-center" : "gap-2.5 px-2",
                      isActive
                        ? "bg-[#f0f0fd] text-[#1a1a8a]"
                        : "text-slate-600 hover:bg-[#f0f0fd]",
                    ].join(" ")
                  }
                >
                  <span className="relative flex shrink-0">
                    <Icon className="h-4 w-4" />
                    {collapsed && (
                      <CountPill
                        count={count}
                        tone={toneFor(item.key)}
                        className="absolute -right-3 -top-2 !h-4 !min-w-[16px] !px-1 !text-[9px] !leading-4"
                      />
                    )}
                  </span>

                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      <CountPill count={count} tone={toneFor(item.key)} />
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}

        {!collapsed && pins.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <div className={SECTION_TITLE}>Pinned projects</div>

            {pins.map((pin) => (
              <button
                key={pin.id}
                type="button"
                onClick={() => navigate("/", { state: { search: pin.name } })}
                title={`${pin.name} — open in Work sheet`}
                className="flex h-[30px] items-center gap-2.5 rounded-[7px] px-2 text-left text-[13px] text-slate-600 transition-colors hover:bg-[#f3f4f6]"
              >
                <span className="flex w-4 justify-center">
                  <span
                    className={`h-2 w-2 rounded-[3px] ${
                      STATUS_COLORS[pin.status]?.dot || "bg-slate-300"
                    }`}
                  />
                </span>
                <span className="flex-1 truncate">{pin.name}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* Footer: help, bug report, user */}
      <div
        className={`relative flex flex-col gap-0.5 pb-3 pt-2 shadow-[inset_0_1px_0_rgb(226,232,240)] ${
          collapsed ? "px-2" : "px-3"
        }`}
      >
        <button
          ref={helpButtonRef}
          type="button"
          onClick={openHelpNearButton}
          title={collapsed ? "Help and shortcuts" : undefined}
          data-testid="sidebar-help"
          className={`${footerButton} ${collapsed ? "justify-center" : "gap-2.5 px-2"}`}
        >
          <CircleHelp className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="flex-1 text-left">Help and shortcuts</span>}
        </button>

        <button
          type="button"
          onClick={() => window.open(BUG_REPORT_URL, "_blank", "noopener,noreferrer")}
          title={collapsed ? "Report a bug" : undefined}
          data-testid="sidebar-report-bug"
          className={`${footerButton} ${collapsed ? "justify-center" : "gap-2.5 px-2"}`}
        >
          <Bug className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="flex-1 text-left">Report a bug</span>}
        </button>

        {currentUser && (
          <button
            type="button"
            data-testid={LAYOUT.sidebarUserInfo}
            onClick={() => setUserMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            title={collapsed ? currentUser.name : undefined}
            className={`mt-1 flex h-11 items-center rounded-[7px] text-left transition-colors hover:bg-[#f3f4f6] ${
              collapsed ? "justify-center" : "gap-2.5 px-2"
            }`}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#dcdcf8] text-xs font-semibold text-[#1a1a8a]">
              {initial}
            </span>

            {!collapsed && (
              <>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-semibold text-slate-900">
                    {currentUser.name}
                  </span>
                  <span className="text-[11px] text-[#546490]">
                    {ROLE_LABELS[currentUser.role] || currentUser.role}
                  </span>
                </span>
                <ChevronUp className="h-4 w-4 text-[#546490]" />
              </>
            )}
          </button>
        )}

        {userMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-30"
              onMouseDown={() => setUserMenuOpen(false)}
              aria-hidden="true"
            />
            <div
              role="menu"
              className="absolute bottom-[68px] left-3 z-40 flex w-[212px] flex-col gap-0.5 rounded-xl bg-white p-1.5 shadow-[0_0_0_1px_rgba(234,238,244,1),0_6px_25px_rgba(13,28,61,0.1)]"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setUserMenuOpen(false);
                  navigate("/profile");
                }}
                className="flex h-8 items-center gap-2.5 rounded-[7px] px-2 text-left text-[13px] text-slate-600 hover:bg-slate-100"
              >
                <User className="h-3.5 w-3.5" />
                Profile
              </button>

              <button
                type="button"
                role="menuitem"
                data-testid="sidebar-logout-btn"
                onClick={handleLogout}
                className="flex h-8 items-center gap-2.5 rounded-[7px] px-2 text-left text-[13px] text-red-500 hover:bg-red-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                Log out
              </button>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
