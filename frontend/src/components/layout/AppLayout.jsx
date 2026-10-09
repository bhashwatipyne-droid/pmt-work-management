import { useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import { useNavCounts } from "@/hooks/useNavCounts";
import { CommandCenterProvider } from "./CommandCenter";
import { getBreadcrumb, IS_MAC } from "./navItems";
import { BulkReviewButton } from "./BulkReviewButton";
import TaskCardHost from "@/components/tasks/TaskCardHost";
import { useUser } from "@/context/UserContext";
import { showTaskCards } from "@/lib/planning/featureFlags";

const KBD =
  "inline-flex h-[18px] items-center rounded px-[5px] text-[10px] font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(234,238,244,1)]";

// The bell, "Report a bug", help and the profile menu now live in the
// sidebar (see Sidebar.jsx); the top bar is where you are, the ⌘K hint, and
// the Bulk review button (reviewers only).
export const AppLayout = ({ children }) => {
  const { pathname } = useLocation();
  const { section, title } = getBreadcrumb(pathname);
  const { currentUser } = useUser();
  const counts = useNavCounts();

  return (
    <CommandCenterProvider>
      <div className="flex h-screen bg-[#f7f9fc] max-md:h-[100dvh]">
        <Sidebar counts={counts} />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[#eaeef4] bg-white px-3 pt-[env(safe-area-inset-top)] max-md:h-[calc(52px+env(safe-area-inset-top))] md:px-5">
            {/* phone: the sidebar is hidden, so the logo mark and bell live here */}
            <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[#2b2bb5] text-xs font-bold tracking-tight text-white md:hidden">
              P
            </div>

            <span className="hidden text-[13px] text-[#546490] md:inline">{section}</span>
            {title && (
              <>
                <ChevronRight className="hidden h-3.5 w-3.5 text-slate-400 md:block" />
                <span className="truncate text-[15px] font-semibold text-slate-900 md:text-[13px]">
                  {title}
                </span>
              </>
            )}

            <div className="flex-1" />

            <span className="hidden items-center gap-1.5 text-xs text-[#546490] sm:flex">
              Press <span className={KBD}>{IS_MAC ? "⌘K" : "Ctrl K"}</span> to find anything
            </span>

            <BulkReviewButton />

            <div className="md:hidden">
              <NotificationCenter placement="header" />
            </div>
          </header>

          <main className="flex flex-1 flex-col overflow-hidden max-md:pb-[calc(56px+env(safe-area-inset-bottom))]">
            {children}
          </main>
          {showTaskCards(currentUser) && <TaskCardHost />}
        </div>

        <MobileNav counts={counts} />
      </div>
    </CommandCenterProvider>
  );
};