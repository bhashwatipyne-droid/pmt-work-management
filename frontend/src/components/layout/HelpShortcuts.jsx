import { useAccess } from "@/hooks/useAccess";
import { MOD_LABEL } from "./navItems";

const KBD =
  "inline-flex h-5 items-center rounded px-1.5 text-[10px] font-semibold text-slate-700 shadow-[inset_0_0_0_1px_rgba(234,238,244,1)]";

// "Help and shortcuts" popover. It only lists shortcuts that exist for the
// signed-in role, so nobody reads about a key that does nothing for them.
export const HelpShortcuts = ({ open, onClose, anchor }) => {
  const access = useAccess();

  if (!open) return null;

  const shortcuts = [
    { label: "Search or jump to", keys: `${MOD_LABEL} K` },
    access.canLogWork && { label: "Quick log", keys: "L" },
    { label: "Go to Work sheet", keys: "G W" },
    access.canViewApprovals && { label: "Go to Approvals", keys: "G A" },
    access.canActOnApprovals && {
      label: "Approve / send back",
      keys: `${MOD_LABEL} A / S`,
    },
    access.canViewApprovals && {
      label: "Next / previous approval",
      keys: `${MOD_LABEL} J / K`,
    },
    { label: "Show this list", keys: "?" },
    { label: "Close panel", keys: "Esc" },
  ].filter(Boolean);

  const left = anchor?.left ?? 244;
  const bottom = anchor?.bottom ?? 60;

  return (
    <>
      <div className="fixed inset-0 z-[60]" onMouseDown={onClose} aria-hidden="true" />
      <div
        role="region"
        aria-label="Keyboard shortcuts"
        data-testid="help-shortcuts"
        style={{ left, bottom }}
        className="fixed z-[61] flex w-[280px] flex-col gap-0.5 rounded-xl bg-white p-2 shadow-[0_0_0_1px_rgba(234,238,244,1),0_6px_25px_rgba(13,28,61,0.1)]"
      >
        <div className="px-2 py-1.5 text-[11px] font-bold uppercase leading-[14px] tracking-[0.05em] text-slate-500">
          Keyboard shortcuts
        </div>

        {shortcuts.map((shortcut) => (
          <div
            key={shortcut.label}
            className="flex h-[30px] items-center gap-2 px-2 text-[13px] text-slate-600"
          >
            <span className="flex-1">{shortcut.label}</span>
            <span className={KBD}>{shortcut.keys}</span>
          </div>
        ))}
      </div>
    </>
  );
};
