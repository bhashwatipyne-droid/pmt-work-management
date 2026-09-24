import { useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";

import { Sidebar } from "./Sidebar";
import { CommandCenterProvider } from "./CommandCenter";
import { getBreadcrumb, IS_MAC } from "./navItems";

const KBD =
  "inline-flex h-[18px] items-center rounded px-[5px] text-[10px] font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(234,238,244,1)]";

// The bell, "Report a bug", help and the profile menu now live in the
// sidebar (see Sidebar.jsx); the top bar is just where you are.
export const AppLayout = ({ children }) => {
  const { pathname } = useLocation();
  const { section, title } = getBreadcrumb(pathname);

  return (
    <CommandCenterProvider>
      <div className="flex h-screen bg-[#f7f9fc]">
        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[#eaeef4] bg-white px-5">
            <span className="text-[13px] text-[#546490]">{section}</span>
            {title && (
              <>
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                <span className="text-[13px] font-semibold text-slate-900">
                  {title}
                </span>
              </>
            )}

            <div className="flex-1" />

            <span className="hidden items-center gap-1.5 text-xs text-[#546490] sm:flex">
              Press <span className={KBD}>{IS_MAC ? "⌘K" : "Ctrl K"}</span> to find anything
            </span>
          </header>

          <main className="flex flex-1 flex-col overflow-hidden">{children}</main>
        </div>
      </div>
    </CommandCenterProvider>
  );
};
