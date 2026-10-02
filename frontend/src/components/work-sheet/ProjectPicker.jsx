import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { distinguishingParts, isProjectClosed } from "@/lib/lookalikes";
import { focusAdjacentCell } from "./useWorksheetKeyboardNavigation";

// More than this many options and the list asks the user to type instead of
// mounting a thousand rows at once.
const MAX_OPTIONS = 150;
const PREVIEW_WIDTH = 340;

// A project name with the words that tell it apart from its look-alikes in
// bold ("ICICI Prudential Contra Fund – **Anniversary**").
export function ProjectNameParts({ project, twins, clientNameOf }) {
  const parts = distinguishingParts(project, twins, clientNameOf);
  return parts.map((part, i) =>
    part.bold ? (
      <strong key={i} className="font-bold text-[#1a1a8a]">
        {part.text}
      </strong>
    ) : (
      <span key={i}>{part.text}</span>
    )
  );
}

export function LookalikePill() {
  return (
    <span className="mt-0.5 inline-flex self-start rounded-full bg-amber-100 px-2 py-px text-[11px] font-medium leading-4 text-amber-800">
      Has a look-alike
    </span>
  );
}

const matchesQuery = (project, clientName, q) => {
  if (!q) return true;
  const haystack = [project.name, clientName, project.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
};

// Work Sheet Project cell. Replaces the plain searchable list with the
// redesign's picker: projects grouped by the row's client (recently used
// first), look-alike names flagged with the words that differ in bold, and a
// hover preview of the project's deliverables that fills Project and
// Deliverable in one click. Delivered and scrapped projects are not offered:
// no new work gets logged against them.
export function ProjectPicker({
  value,
  projects = [],
  clientId,
  clientNameOf,
  isRecent = () => false,
  lookalikes,
  deliverablesByProject = {},
  disabled = false,
  open = false,
  onOpenChange,
  onPick,
  triggerProps = {},
  "data-testid": testId,
}) {
  const [search, setSearch] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [preview, setPreview] = useState(null); // { id, top }
  const [previewSide, setPreviewSide] = useState("right");
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const contentRef = useRef(null);
  const triggerRef = useRef(null);
  const leavingByTabRef = useRef(false);
  const previewTimerRef = useRef(null);

  const current = value ? projects.find((p) => String(p.id) === String(value)) : null;
  const clientName = clientId ? clientNameOf(clientId) : "";

  useEffect(() => {
    if (!open) {
      setSearch("");
      setPreview(null);
      return;
    }
    setHighlight(0);
  }, [open]);

  // Grouped, filtered options. Only computed while open; while the popover
  // animates closed it keeps showing the last list.
  const lastOptionsRef = useRef([]);
  const options = useMemo(() => {
    if (!open) return lastOptionsRef.current;
    const q = search.trim().toLowerCase();
    const rows = [];

    projects.forEach((project) => {
      if (isProjectClosed(project)) return;
      const ownClient = clientNameOf(project.client_id);
      if (!matchesQuery(project, ownClient, q)) return;

      let group;
      if (clientId) {
        if (project.client_id === clientId) group = isRecent(project.id) ? 0 : 1;
        else if (q) group = 2;
        else return; // other clients' projects only when searching
      } else {
        group = isRecent(project.id) ? 0 : 1;
      }
      rows.push({ project, group });
    });

    rows.sort((a, b) => a.group - b.group);

    const heads = clientId
      ? [
          `Recently used for ${clientName}`,
          `Other projects for ${clientName}`,
          "Other clients",
        ]
      : ["Recently used", "All projects", ""];

    const next = rows.map((row, i) => ({
      ...row,
      head: i === 0 || rows[i - 1].group !== row.group ? heads[row.group] : null,
    }));
    lastOptionsRef.current = next;
    return next;
  }, [open, search, projects, clientId, clientName, clientNameOf, isRecent]);

  const shown = options.slice(0, MAX_OPTIONS);
  const hiddenCount = options.length - shown.length;
  const hasLookalikes = shown.some((o) => lookalikes?.has(o.project.id));

  useEffect(() => {
    setHighlight((h) => Math.min(h, Math.max(0, shown.length - 1)));
  }, [shown.length]);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-option-index="${highlight}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [highlight]);

  // Put the preview on whichever side of the list has room.
  useLayoutEffect(() => {
    if (!preview || !contentRef.current) return;
    const rect = contentRef.current.getBoundingClientRect();
    const roomRight = window.innerWidth - rect.right;
    setPreviewSide(roomRight >= PREVIEW_WIDTH + 16 || rect.left < PREVIEW_WIDTH + 16 ? "right" : "left");
  }, [preview]);

  const close = () => onOpenChange?.(false);

  const pick = (project, deliverable = null) => {
    onPick?.(project, deliverable);
    close();
  };

  const showPreviewFor = (project, target) => {
    clearTimeout(previewTimerRef.current);
    const contentTop = contentRef.current?.getBoundingClientRect().top || 0;
    const top = target ? target.getBoundingClientRect().top - contentTop - 8 : 0;
    setPreview({ id: project.id, top: Math.max(0, top) });
  };

  const hidePreviewSoon = () => {
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => setPreview(null), 180);
  };

  const keepPreview = () => clearTimeout(previewTimerRef.current);

  const handleTriggerKeyDown = (event) => {
    triggerProps.onKeyDown?.(event);
    if (event.defaultPrevented || disabled || open || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      setSearch(event.key);
      onOpenChange?.(true);
    }
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      setPreview(null);
      setHighlight((h) =>
        Math.max(0, Math.min(shown.length - 1, h + (event.key === "ArrowDown" ? 1 : -1)))
      );
      return;
    }

    // Left / Right with nothing typed: close and step to the neighbouring
    // cell (Up / Down move through the list).
    if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      !search &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      leavingByTabRef.current = true;
      close();
      focusAdjacentCell(triggerRef.current, event.key === "ArrowLeft" ? -1 : 1, false);
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      const option = shown[highlight];
      if (event.key === "Tab") {
        // Tab picks the highlighted project (if the search found one) and
        // moves on, like a spreadsheet.
        leavingByTabRef.current = true;
        if (option && search.trim()) onPick?.(option.project, null);
        close();
        focusAdjacentCell(triggerRef.current, event.shiftKey ? -1 : 1);
        return;
      }
      if (option) pick(option.project);
      return;
    }

    if (event.key === "Escape") {
      event.stopPropagation();
      return; // Radix closes the popover and returns focus to the cell.
    }

    // Everything else is typing in the search box; keep it away from the
    // sheet's own key handling.
    event.stopPropagation();
  };

  const previewProject = preview ? projects.find((p) => p.id === preview.id) : null;
  const previewDeliverables = previewProject ? deliverablesByProject[previewProject.id] || [] : [];

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && onOpenChange?.(next)}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          {...triggerProps}
          data-testid={testId}
          disabled={disabled}
          onKeyDown={handleTriggerKeyDown}
          title={current?.name}
          className="flex min-h-8 w-full items-start justify-between gap-2 rounded-md px-2 py-[5px] text-left text-[13px] leading-5 outline-none"
        >
          <span className={`min-w-0 flex-1 whitespace-normal break-words ${current ? "" : "text-muted-foreground"}`}>
            {current?.name || "Project"}
          </span>
          <ChevronsUpDown className="mt-[3px] h-3.5 w-3.5 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        ref={contentRef}
        align="start"
        sideOffset={4}
        className="relative w-[480px] max-w-[calc(100vw-16px)] overflow-visible p-1.5"
        onOpenAutoFocus={(event) => {
          // Runs once the content has mounted; focusing from the open effect
          // could run before the input existed, leaving typing on the cell.
          event.preventDefault();
          const input = inputRef.current;
          if (!input) return;
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }}
        onCloseAutoFocus={(event) => {
          if (leavingByTabRef.current) {
            leavingByTabRef.current = false;
            event.preventDefault();
          }
        }}
      >
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlight(0);
            setPreview(null);
          }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search project or client"
          aria-label="Search projects"
          className="h-8 w-full rounded-md border border-input px-2 text-[13px] outline-none focus:border-[#2b2bb5]"
        />
        {hasLookalikes && (
          <p className="px-2 pt-1.5 text-[11px] leading-[14px] text-muted-foreground">
            Bold words tell similar projects apart.
          </p>
        )}

        <div
          ref={listRef}
          role="listbox"
          onMouseLeave={hidePreviewSoon}
          onScroll={() => setPreview(null)}
          className="mt-1 flex max-h-[360px] flex-col gap-px overflow-y-auto"
        >
          {shown.map((option, index) => {
            const { project } = option;
            const twins = lookalikes?.get(project.id) || [];
            const otherClient = project.client_id !== clientId;
            const sub = otherClient ? clientNameOf(project.client_id) : "";
            const isCurrent = String(project.id) === String(value);

            return (
              <div key={project.id} className="contents">
                {option.head && (
                  <span className="shrink-0 px-2 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    {option.head}
                  </span>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  data-option-index={index}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(project)}
                  onMouseEnter={(e) => {
                    setHighlight(index);
                    showPreviewFor(project, e.currentTarget);
                  }}
                  className={`flex shrink-0 items-start gap-2 rounded-md px-2.5 py-1.5 text-left ${
                    index === highlight ? "bg-[#f0f0fd]" : ""
                  }`}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="whitespace-normal break-words text-sm leading-[18px] text-foreground">
                      <ProjectNameParts project={project} twins={twins} clientNameOf={clientNameOf} />
                    </span>
                    {project.description && (
                      <span className="whitespace-normal break-words text-xs leading-4 text-slate-600">{project.description}</span>
                    )}
                    {sub && <span className="whitespace-normal break-words text-[11px] leading-[14px] text-muted-foreground">{sub}</span>}
                    {twins.length > 0 && <LookalikePill />}
                  </span>
                  {isCurrent && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2b2bb5]" />}
                </button>
              </div>
            );
          })}

          {shown.length === 0 && (
            <span className="p-2 text-xs text-muted-foreground">
              {search.trim()
                ? "No active project matches. Delivered and scrapped projects aren't listed."
                : clientId
                  ? `No active projects for ${clientName}. Type to search other clients.`
                  : "No active projects."}
            </span>
          )}
          {hiddenCount > 0 && (
            <span className="p-2 text-xs text-muted-foreground">
              {hiddenCount} more. Type to narrow the list.
            </span>
          )}
        </div>

        {previewProject && (
          <div
            role="dialog"
            aria-label="Deliverables in this project"
            onMouseEnter={keepPreview}
            onMouseLeave={hidePreviewSoon}
            style={{
              top: preview.top,
              width: PREVIEW_WIDTH,
              [previewSide === "right" ? "left" : "right"]: "calc(100% + 8px)",
            }}
            className="absolute z-10 flex max-h-[420px] flex-col gap-2.5 rounded-lg border border-border bg-white p-3 shadow-lg"
          >
            <div className="flex flex-col gap-0.5">
              <span className="break-words text-sm font-semibold leading-[18px] text-foreground">{previewProject.name}</span>
              {previewProject.description && (
                <span className="text-xs leading-4 text-slate-600">{previewProject.description}</span>
              )}
              <span className="text-[11px] leading-[14px] text-muted-foreground">
                {[clientNameOf(previewProject.client_id), previewProject.status]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Deliverables
              </span>
              <span className="text-[11px] text-muted-foreground">{previewDeliverables.length}</span>
            </div>
            {previewDeliverables.length > 0 ? (
              <>
                <span className="-mt-1 text-[11px] leading-[14px] text-muted-foreground">
                  Click a deliverable to fill project and deliverable.
                </span>
                <div className="-mx-1.5 flex max-h-[240px] min-h-[60px] flex-col gap-px overflow-y-auto overscroll-contain px-1.5">
                  {previewDeliverables.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pick(previewProject, d)}
                      title={`Use ${d.name}`}
                      className="-mx-1.5 flex min-h-[30px] shrink-0 items-center rounded-md px-1.5 py-1 text-left text-[13px] leading-[18px] text-foreground hover:bg-[#f0f0fd]"
                    >
                      <span className="min-w-0 whitespace-normal break-words">{d.name}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">No deliverables yet.</span>
            )}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(previewProject)}
              className="h-[30px] rounded-md bg-slate-50 text-xs font-semibold text-[#2b2bb5] hover:bg-[#f0f0fd]"
            >
              Use this project only
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
