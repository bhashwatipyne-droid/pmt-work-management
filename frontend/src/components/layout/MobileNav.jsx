import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Bug, LogOut, MoreHorizontal, Search, User, X } from "lucide-react";

import { useUser } from "@/context/UserContext";
import { useAccess } from "@/hooks/useAccess";
import { ROLE_LABELS } from "@/lib/permissions";
import { useCommandCenter } from "./CommandCenter";
import { CountPill } from "./Sidebar";
import { BUG_REPORT_URL, getNavItems } from "./navItems";

// Phone navigation (below `md`): the sidebar is hidden and these few
// destinations live in a bottom bar, within thumb reach. Everything else, plus
// search, profile and log out, is behind "More". Which items get a slot is what
// people do on the move: log work, review, see the day, check a project.
const TAB_PRIORITY = ["worksheet", "approvals", "home", "projects", "planning"];
const TAB_SLOTS = 4;

const toneFor = (key) => (key === "approvals" ? "brand" : "error");

const tabClass = (active) =>
  [
    "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 text-[10.5px] font-medium transition-colors",
    active ? "text-[#2b2bb5]" : "text-slate-500 active:bg-[#f0f0fd]",
  ].join(" ");

export const MobileNav = ({ counts = { worksheet: 0, approvals: 0 } }) => {
  const { currentUser, logout } = useUser();
  const access = useAccess();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { openPalette } = useCommandCenter();
  const [moreOpen, setMoreOpen] = useState(false);

  // moving to another page always closes the sheet
  useEffect(() => setMoreOpen(false), [pathname]);

  // lock the page behind the sheet
  useEffect(() => {
    if (!moreOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [moreOpen]);

  const allowed = getNavItems(access);
  const byKey = Object.fromEntries(allowed.map((i) => [i.key, i]));
  const tabs = TAB_PRIORITY.map((key) => byKey[key])
    .filter(Boolean)
    .slice(0, TAB_SLOTS);
  allowed.forEach((item) => {
    if (tabs.length < TAB_SLOTS && !tabs.includes(item)) tabs.push(item);
  });
  const overflow = allowed.filter((i) => !tabs.includes(i));

  const countFor = (key) =>
    key === "worksheet"
      ? counts.worksheet
      : key === "approvals"
        ? counts.approvals
        : 0;

  const isActive = (item) =>
    item.to === "/"
      ? pathname === "/"
      : pathname === item.to || pathname.startsWith(`${item.to}/`);
  const moreActive = moreOpen || overflow.some(isActive);

  const initial = (currentUser?.name || "?").trim().charAt(0).toUpperCase();

  const go = (to) => {
    setMoreOpen(false);
    navigate(to);
  };

  const handleLogout = async () => {
    setMoreOpen(false);
    await logout();
    navigate("/");
  };

  const sheetRow =
    "flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium text-slate-700 active:bg-[#f0f0fd]";

  return (
    <>
      <nav
        aria-label="Primary"
        data-testid="mobile-nav"
        className="fixed inset-x-0 bottom-0 z-40 flex min-h-[56px] border-t border-[#eaeef4] bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(13,28,61,0.06)] md:hidden"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);

          return (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === "/"}
              data-testid={`mobile-${item.testId}`}
              aria-current={active ? "page" : undefined}
              className={tabClass(active)}
            >
              <span className="relative flex">
                <Icon
                  className="h-[22px] w-[22px]"
                  strokeWidth={active ? 2.3 : 1.9}
                />
                <CountPill
                  count={countFor(item.key)}
                  tone={toneFor(item.key)}
                  className="absolute -right-3 -top-1.5 !h-4 !min-w-[16px] !px-1 !text-[9px] !leading-4"
                />
              </span>
              <span className="max-w-full truncate px-1">{item.label}</span>
            </NavLink>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreOpen((open) => !open)}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          data-testid="mobile-nav-more"
          className={tabClass(moreActive)}
        >
          <MoreHorizontal
            className="h-[22px] w-[22px]"
            strokeWidth={moreActive ? 2.3 : 1.9}
          />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="More"
        >
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />

          <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-2xl bg-white pb-[max(12px,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(13,28,61,0.18)]">
            <div className="flex items-center gap-3 px-4 pb-2 pt-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dcdcf8] text-sm font-semibold text-[#1a1a8a]">
                {initial}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px] font-semibold text-slate-900">
                  {currentUser?.name}
                </span>
                <span className="text-xs text-[#546490]">
                  {ROLE_LABELS[currentUser?.role] || currentUser?.role}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-0.5 overflow-y-auto px-2 pb-1">
              <button
                type="button"
                className={sheetRow}
                data-testid="mobile-search"
                onClick={() => {
                  setMoreOpen(false);
                  openPalette();
                }}
              >
                <Search className="h-5 w-5 text-[#546490]" />
                Search or jump to
              </button>

              {overflow.map((item) => {
                const Icon = item.icon;
                const active = isActive(item);

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => go(item.to)}
                    data-testid={`mobile-more-${item.key}`}
                    className={`${sheetRow} ${
                      active ? "bg-[#f0f0fd] text-[#1a1a8a]" : ""
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </button>
                );
              })}

              <div className="my-1 h-px bg-[#eaeef4]" />

              <button
                type="button"
                className={sheetRow}
                onClick={() => go("/profile")}
              >
                <User className="h-5 w-5 text-[#546490]" />
                Profile &amp; account
              </button>

              <button
                type="button"
                className={sheetRow}
                onClick={() =>
                  window.open(BUG_REPORT_URL, "_blank", "noopener,noreferrer")
                }
              >
                <Bug className="h-5 w-5 text-[#546490]" />
                Report a bug
              </button>

              <button
                type="button"
                className={`${sheetRow} text-red-500 active:bg-red-50`}
                data-testid="mobile-logout"
                onClick={handleLogout}
              >
                <LogOut className="h-5 w-5" />
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
