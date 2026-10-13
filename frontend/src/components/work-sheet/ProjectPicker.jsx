import { makeMatcher, normalizeText, searchTokens } from "@/lib/search";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { STAGE_COLORS } from "@/constants/projectPalette";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { distinguishingParts } from "@/lib/lookalikes";
import { focusAdjacentCell } from "./useWorksheetKeyboardNavigation";

// More than this many options and the list asks the user to type instead of
// mounting a thousand rows at once.
const MAX_OPTIONS = 150;
const PREVIEW_WIDTH = 400;
// Deliverables listed under a project when the search matched them.
const MAX_HITS_PER_PROJECT = 5;

// The deliverable's type ("Carousel", "Key Visuals ...") as a small pill next
// to its name, so two deliverables with the same name can be told apart.
export function DeliverableTypeChip({ type, className = "" }) {
  if (!type) return null;
  return (
    <span
      className={`inline-flex shrink-0 rounded-full bg-[#f0f0fd] px-2 py-px text-[11px] font-medium leading-4 text-[#1a1a8a] ${className}`}
    >
      {type}
    </span>
  );
}

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

// Work Sheet Project cell. Replaces the plain searchable list with the
// redesign's picker: projects grouped by the row's client (recently used
// first), look-alike names told apart by the words that differ in bold, and a
// hover preview of the project's deliverables that fills Project and
// Deliverable (and its type) in one click. Typing also searches deliverable
// names: a match is listed under its project and picking it fills both.
// Delivered and scrapped projects are not offered: no new work gets logged
// against them.
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
  const [previewQuery, setPreviewQuery] = useState("");
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
      setPreviewQuery("");
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
    const matchProject = makeMatcher(q);
    const tokens = searchTokens(q);
    // A deliverable is a hit when every word typed is found across its own
    // name, the project and the client ("invesco kv"), and at least one of
    // those words is in the deliverable's name - so typing a project name does
    // not list every deliverable of it.
    const nameHasToken = (deliverable) => {
      const name = normalizeText(deliverable.name);
      const compact = name.replace(/ /g, "");
      return tokens.some((t) => name.includes(t) || compact.includes(t));
    };

    projects.forEach((project) => {
      const ownClient = clientNameOf(project.client_id);
      const projectHit = matchProject(project.name, ownClient, project.description);
      const hits = q
        ? (deliverablesByProject[project.id] || []).filter(
            (d) =>
              nameHasToken(d) &&
              matchProject(d.name, project.name, ownClient, project.description)
          )
        : [];
      if (!projectHit && hits.length === 0) return;

      let group;
      if (clientId) {
        // A client is already chosen on the row, so only its projects are
        // offered (clear the client to search across all of them).
        if (project.client_id !== clientId) return;
        group = isRecent(project.id) ? 0 : 1;
      } else {
        group = isRecent(project.id) ? 0 : 1;
      }
      rows.push({ project, group, hits });
    });

    rows.sort((a, b) => a.group - b.group);

    const heads = clientId
      ? [
          `Recently used for ${clientName}`,
          `Other projects for ${clientName}`,
        ]
      : ["Recently used", "All projects", ""];

    // One entry per selectable line: a project, then the deliverables the
    // search found in it (so Enter / arrow keys walk through both).
    const next = [];
    rows.forEach((row, i) => {
      next.push({
        kind: "project",
        project: row.project,
        head: i === 0 || rows[i - 1].group !== row.group ? heads[row.group] : null,
      });
      const listed = row.hits.slice(0, MAX_HITS_PER_PROJECT);
      listed.forEach((deliverable, j) => {
        next.push({
          kind: "deliverable",
          project: row.project,
          deliverable,
          moreAfter: j === listed.length - 1 ? row.hits.length - listed.length : 0,
        });
      });
    });
    lastOptionsRef.current = next;
    return next;
  }, [open, search, projects, deliverablesByProject, clientId, clientName, clientNameOf, isRecent]);

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
    // A different project starts with an empty deliverable search.
    setPreviewQuery((q) => (preview?.id === project.id ? q : ""));
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
        if (option && search.trim()) onPick?.(option.project, option.deliverable || null);
        close();
        focusAdjacentCell(triggerRef.current, event.shiftKey ? -1 : 1);
        return;
      }
      if (option) pick(option.project, option.deliverable || null);
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
  const allPreviewDeliverables = previewProject ? deliverablesByProject[previewProject.id] || [] : [];
  const previewMatch = makeMatcher(previewQuery);
  const pq = previewQuery.trim();
  const previewDeliverables = pq
    ? allPreviewDeliverables.filter((d) =>
        previewMatch(d.name, d.type, d.current_stage, d.stage_status)
      )
    : allPreviewDeliverables;

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
          className="flex h-8 w-full items-center justify-between gap-2 rounded-md px-2 py-[5px] text-left text-[13px] leading-5 outline-none"
        >
          <span className={`min-w-0 flex-1 truncate ${current ? "" : "text-muted-foreground"}`}>
            {current?.name || "Project"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
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
          placeholder="Search project, client or deliverable"
          aria-label="Search projects and deliverables"
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

            if (option.kind === "deliverable") {
              const d = option.deliverable;
              const dot = STAGE_COLORS[d.current_stage]?.dot || "bg-slate-300";
              return (
                <div key={`d-${project.id}-${d.id}`} className="contents">
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    data-option-index={index}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(project, d)}
                    onMouseEnter={() => {
                      setHighlight(index);
                      setPreview(null);
                    }}
                    title={`Use ${d.name} in ${project.name}`}
                    className={`ml-5 flex shrink-0 items-start gap-2 rounded-md px-2.5 py-1.5 text-left ${
                      index === highlight ? "bg-[#f0f0fd]" : ""
                    }`}
                  >
                    <span title={d.current_stage} className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                    <span className="min-w-0 flex-1 whitespace-normal break-words text-[13px] leading-[18px] text-foreground">
                      {d.name}
                    </span>
                    <DeliverableTypeChip type={d.type} className="mt-px" />
                  </button>
                  {option.moreAfter > 0 && (
                    <span className="ml-5 px-2.5 pb-1 text-[11px] text-muted-foreground">
                      {option.moreAfter} more in this project. Type more to narrow.
                    </span>
                  )}
                </div>
              );
            }

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
                  </span>
                  {isCurrent && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2b2bb5]" />}
                </button>
              </div>
            );
          })}

          {shown.length === 0 && (
            <span className="p-2 text-xs text-muted-foreground">
              {search.trim()
                ? clientId
                  ? `No active project for ${clientName} matches. Delivered and scrapped projects aren't listed.`
                  : "No active project matches. Delivered and scrapped projects aren't listed."
                : clientId
                  ? `No active projects for ${clientName}. Clear the client to search all projects.`
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
              <span className="text-[11px] text-muted-foreground">
                {pq
                  ? `${previewDeliverables.length} of ${allPreviewDeliverables.length}`
                  : allPreviewDeliverables.length}
              </span>
            </div>
            {allPreviewDeliverables.length > 3 && (
              <span className="relative flex shrink-0 items-center">
                <Search className="pointer-events-none absolute left-[9px] h-3 w-3 text-slate-400" />
                <input
                  value={previewQuery}
                  onChange={(e) => {
                    keepPreview();
                    setPreviewQuery(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") setPreviewQuery("");
                  }}
                  placeholder="Search deliverables, owner, type"
                  aria-label={`Search deliverables in ${previewProject.name}`}
                  className="h-[30px] w-full rounded-[7px] border-0 bg-[#f7f9fc] pl-7 pr-7 text-xs leading-4 text-foreground shadow-[inset_0_0_0_1px_#e2e8f0] outline-none transition-shadow focus:bg-white focus:shadow-[inset_0_0_0_1px_#2b2bb5,0_0_0_3px_#dcdcf8]"
                />
                {previewQuery && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setPreviewQuery("");
                    }}
                    className="absolute right-1 flex h-[22px] w-[22px] items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            )}
            {pq && previewDeliverables.length === 0 && (
              <span className="py-2 text-center text-xs text-muted-foreground">
                No deliverables match “{previewQuery.trim()}”
              </span>
            )}
            {previewDeliverables.length > 0 ? (
              <>
                <span className="-mt-1 text-[11px] leading-[14px] text-muted-foreground">
                  Click a deliverable to fill project, deliverable and type.
                </span>
                <div className="-mx-1.5 flex max-h-[240px] min-h-[60px] flex-col gap-0.5 overflow-y-auto overscroll-contain px-1.5">
                  {previewDeliverables.map((d) => {
                    const dot = STAGE_COLORS[d.current_stage]?.dot || "bg-slate-300";
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(previewProject, d)}
                        title={`Use ${d.name}`}
                        className="-mx-1.5 flex min-h-8 shrink-0 items-start gap-2 rounded-[7px] px-1.5 py-1.5 text-left text-[13px] leading-[18px] text-foreground transition-colors hover:bg-[#f0f0fd]"
                      >
                        <span title={d.current_stage} className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                        {/* Wrapped, not clipped: long names are read in full. */}
                        <span className="min-w-0 flex-1 whitespace-normal break-words">{d.name}</span>
                        <span className="flex max-w-[45%] shrink-0 flex-wrap items-start justify-end gap-1">
                          <DeliverableTypeChip type={d.type} />
                          {d.stage_status && (
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-px text-[11px] font-medium leading-4 text-slate-600">
                              {d.stage_status}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              !pq && <span className="text-xs text-muted-foreground">No deliverables yet.</span>
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