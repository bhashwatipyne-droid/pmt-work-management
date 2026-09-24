import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAccess } from "@/hooks/useAccess";
import { APP_ACTIONS, requestAppAction } from "@/lib/appActions";
import { CommandPalette } from "./CommandPalette";
import { HelpShortcuts } from "./HelpShortcuts";
import { BUG_REPORT_URL, getNavItems } from "./navItems";

const CommandCenterContext = createContext({
  openPalette: () => {},
  openHelp: () => {},
});

export const useCommandCenter = () => useContext(CommandCenterContext);

const isEditableTarget = (el) => {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.("role");
  return role === "combobox" || role === "textbox";
};

const anyDialogOpen = () =>
  Boolean(document.querySelector('[role="dialog"], [role="alertdialog"]'));

const CHORD_WINDOW_MS = 900;

// Owns the ⌘K palette, the help popover and the app-wide shortcuts:
//   ⌘/Ctrl K   search or jump to        G then H/W/P/A/C/T/E   go to a page
//   L          quick log (from any page) ?                      shortcuts
// Shortcuts that would open something the person's role can't use are simply
// not registered, so they do nothing (see lib/permissions.js).
export const CommandCenterProvider = ({ children }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const access = useAccess();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpAnchor, setHelpAnchor] = useState(null);
  const chordAt = useRef(0);

  const openPalette = useCallback(() => {
    setHelpOpen(false);
    setPaletteOpen(true);
  }, []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const openHelp = useCallback((anchor) => {
    setPaletteOpen(false);
    setHelpAnchor(anchor || null);
    setHelpOpen(true);
  }, []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  // Run a page-level action, going to that page first when needed.
  const runOnPage = useCallback(
    (action, path) => {
      requestAppAction(action);
      if (pathname !== path) navigate(path);
    },
    [navigate, pathname]
  );

  const actions = useMemo(
    () => ({
      goTo: (path) => navigate(path),
      quickLog: () => runOnPage(APP_ACTIONS.QUICK_LOG, "/"),
      addRow: () => runOnPage(APP_ACTIONS.ADD_ROW, "/"),
      showMissing: () => runOnPage(APP_ACTIONS.SHOW_MISSING, "/"),
      searchWorksheet: (text) => navigate("/", { state: { search: text } }),
      newProject: () => navigate("/projects", { state: { openCreate: true } }),
      addClient: () => navigate("/clients", { state: { openAdd: true } }),
      addMember: () => navigate("/team", { state: { openAdd: true } }),
      reportBug: () =>
        window.open(BUG_REPORT_URL, "_blank", "noopener,noreferrer"),
      showShortcuts: () => openHelp(null),
    }),
    [navigate, runOnPage, openHelp]
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      const key = event.key;

      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && key.toLowerCase() === "k") {
        event.preventDefault();
        setHelpOpen(false);
        setPaletteOpen((open) => !open);
        return;
      }

      if (key === "Escape" && (helpOpen || paletteOpen)) {
        setHelpOpen(false);
        setPaletteOpen(false);
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (paletteOpen || isEditableTarget(event.target)) return;

      if (key === "?") {
        if (anyDialogOpen()) return;
        event.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }

      if (anyDialogOpen()) return;

      // "G" then a letter jumps to a page the role is allowed to open.
      if (Date.now() - chordAt.current < CHORD_WINDOW_MS) {
        chordAt.current = 0;
        const target = getNavItems(access).find(
          (item) => item.chord === key.toUpperCase()
        );
        if (target) {
          event.preventDefault();
          navigate(target.to);
        }
        return;
      }

      if (key === "g" || key === "G") {
        chordAt.current = Date.now();
        return;
      }

      // The work sheet handles "L" itself; this covers every other page.
      if ((key === "l" || key === "L") && access.canLogWork && pathname !== "/") {
        event.preventDefault();
        runOnPage(APP_ACTIONS.QUICK_LOG, "/");
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [access, helpOpen, paletteOpen, navigate, pathname, runOnPage]);

  const value = useMemo(() => ({ openPalette, openHelp }), [openPalette, openHelp]);

  return (
    <CommandCenterContext.Provider value={value}>
      {children}
      <CommandPalette open={paletteOpen} onClose={closePalette} actions={actions} />
      <HelpShortcuts open={helpOpen} onClose={closeHelp} anchor={helpAnchor} />
    </CommandCenterContext.Provider>
  );
};
