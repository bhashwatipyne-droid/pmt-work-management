import { useMemo, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, List, Search } from "lucide-react";

import { ACTIVITY_FILTERS, formatMins, fmtWeekday } from "@/lib/homeDashboard";
import { avatarColorClasses } from "@/lib/avatarColors";

// "Team activity" tab of the Home page: who is doing what right now.
// Calculations live in lib/homeDashboard.js (buildTeamActivity); this file
// only draws them. Colours follow the same Mint tokens as DashboardPage.

const C = {
  n900: "rgb(13,27,62)",
  n700: "rgb(74,88,120)",
  n500: "rgb(84,100,144)",
  n400: "rgb(138,151,181)",
  n100: "rgb(245,246,248)",
  brand500: "rgb(43,43,181)",
  success500: "rgb(16,185,129)",
  warning500: "rgb(245,158,11)",
  warningText: "rgb(146,64,14)",
  error500: "rgb(239,68,68)",
  successText: "rgb(0,91,75)",
};

const STAGE_DOT = { Content: C.brand500, Design: "rgb(59,130,246)", Animate: C.warning500 };

const BADGE = {
  Neutral: { bg: C.n100, fg: C.n700, dot: C.n400 },
  Info: { bg: "rgb(219,234,254)", fg: "rgb(30,64,175)", dot: "rgb(59,130,246)" },
  Warning: { bg: "rgb(254,243,199)", fg: C.warningText, dot: C.warning500 },
  Success: { bg: "rgb(209,250,229)", fg: C.successText, dot: C.success500 },
  Error: { bg: "rgb(255,245,245)", fg: C.error500, dot: C.error500 },
};

const STATE_LABEL = {
  busy: ["Working", "Success"],
  review: ["In review", "Info"],
  blocked: ["Blocked", "Error"],
  idle: ["Not logged today", "Warning"],
};

// Deliverable status (Upcoming) and work-sheet status (Recent work).
const ITEM_BADGE = {
  "On track": "Success",
  "At risk": "Warning",
  Delayed: "Error",
  "In review": "Info",
  Ongoing: "Info",
  "Ready for Review": "Info",
  "Changes Requested": "Warning",
  Rework: "Warning",
  "On Hold": "Neutral",
  "Not Started": "Neutral",
  Closed: "Success",
  Scrap: "Neutral",
};

const HAIRLINE = "shadow-[inset_0_0_0_1px_rgb(234,238,244)]";
const GRID =
  "grid grid-cols-[28px_minmax(240px,1.2fr)_minmax(210px,1.5fr)_minmax(180px,1.1fr)_minmax(170px,1fr)_96px_110px] gap-x-3";

const Badge = ({ color = "Neutral", children }) => {
  const c = BADGE[color] || BADGE.Neutral;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-4"
      style={{ background: c.bg, color: c.fg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.dot }} />
      {children}
    </span>
  );
};

const initials = (name) =>
  (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const loadTone = (load) =>
  load > 100
    ? { fg: C.error500, bar: C.error500 }
    : load >= 85
      ? { fg: C.warningText, bar: C.warning500 }
      : load < 40
        ? { fg: C.n500, bar: C.success500 }
        : { fg: C.successText, bar: C.success500 };

const MiniList = ({ title, items, empty }) => (
  <div className={`flex flex-col gap-1 rounded-[10px] bg-white p-3 ${HAIRLINE}`}>
    <span className="pb-1 font-['Manrope','Inter',sans-serif] text-[11px] font-bold uppercase leading-[14px] tracking-[0.05em] text-[rgb(84,100,144)]">
      {title}
    </span>
    {items.length === 0 ? (
      <span className="text-[12px] text-[rgb(84,100,144)]">{empty}</span>
    ) : (
      items.map((u) => (
        <div key={u.key} className="flex min-h-8 items-center gap-2">
          <span className="flex min-w-0 flex-1 flex-col gap-px">
            <span className="truncate text-[13px] text-[rgb(13,27,62)]" title={u.name}>{u.name}</span>
            <span className="truncate text-[11px] text-[rgb(84,100,144)]" title={u.meta}>{u.meta}</span>
          </span>
          <Badge color={ITEM_BADGE[u.status] || "Neutral"}>{u.status}</Badge>
        </div>
      ))
    )}
  </div>
);

export default function TeamActivityTab({ activity, onOpenSheet }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState({});

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = activity.everyone
      .filter(activity.tests[filter])
      .filter(
        (p) =>
          !q ||
          `${p.name} ${p.now?.name || ""} ${p.now?.meta || ""} ${p.next?.name || ""}`
            .toLowerCase()
            .includes(q)
      );
    return activity.sort(list);
  }, [activity, filter, query]);

  const allOpen = rows.length > 0 && rows.every((p) => open[p.id]);
  const toggleAll = () =>
    setOpen(Object.fromEntries(rows.map((p) => [p.id, !allOpen])));

  const summary = [
    ["Working now", activity.count("working"), C.success500],
    ["Blocked", activity.count("blocked"), C.error500],
    ["With delays", activity.count("delayed"), C.warning500],
    ["Not logged today", activity.count("idle"), C.n400],
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-['Manrope','Inter',sans-serif] text-[11px] font-bold uppercase leading-4 tracking-[0.06em] text-[rgb(84,100,144)]">
        Who is doing what right now?
      </span>

      {!activity.workingDay && (
        <div className={`rounded-xl bg-white px-4 py-3 text-[13px] text-[rgb(84,100,144)] ${HAIRLINE}`}>
          It&apos;s the weekend, so most people won&apos;t have logged anything today.
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        {summary.map(([label, value, dot]) => (
          <div key={label} className={`flex flex-col gap-1.5 rounded-xl bg-white px-4 py-3.5 ${HAIRLINE}`}>
            <span className="flex items-center gap-2 text-[13px] font-medium text-[rgb(74,88,120)]">
              <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
              {label}
            </span>
            <span className="text-xl font-semibold leading-6 tabular-nums text-[rgb(13,27,62)]">
              {value} / {activity.total}
            </span>
          </div>
        ))}
      </div>

      <section className={`flex flex-col rounded-xl bg-white ${HAIRLINE}`}>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3.5">
          <label className="flex h-8 min-w-[180px] flex-[0_1_260px] items-center gap-2 rounded-[7px] bg-white px-2.5 text-[rgb(84,100,144)] shadow-[inset_0_0_0_1px_rgb(226,232,240)] focus-within:shadow-[inset_0_0_0_2px_rgb(43,43,181)]">
            <Search className="h-3.5 w-3.5" />
            <input
              aria-label="Search people or work"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people or work"
              className="min-w-0 flex-1 border-none bg-transparent text-[13px] text-[rgb(13,27,62)] outline-none placeholder:text-[rgb(138,151,181)]"
            />
          </label>

          <div role="radiogroup" aria-label="Filter team" className="flex flex-wrap gap-1.5">
            {ACTIVITY_FILTERS.map(([key, label]) => {
              const on = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setFilter(key)}
                  className={`flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold ${
                    on
                      ? "bg-[rgb(240,240,253)] text-[rgb(26,26,138)] shadow-[inset_0_0_0_1px_rgb(43,43,181)]"
                      : "bg-white text-[rgb(74,88,120)] shadow-[inset_0_0_0_1px_rgb(226,232,240)] hover:bg-[rgb(249,250,251)]"
                  }`}
                >
                  {label}
                  <span className="font-medium text-[rgb(84,100,144)]">{activity.count(key)}</span>
                </button>
              );
            })}
          </div>

          <span className="flex-1" />
          <button
            type="button"
            onClick={toggleAll}
            className="h-[30px] rounded-[7px] px-2.5 text-[12px] font-semibold text-[rgb(74,88,120)] hover:bg-[rgb(249,250,251)]"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[1140px]">
            <div
              className={`${GRID} h-9 items-center bg-[rgb(249,250,251)] px-4 text-[12px] font-semibold text-[rgb(74,88,120)] shadow-[inset_0_1px_0_rgb(234,238,244),inset_0_-1px_0_rgb(226,232,240)]`}
            >
              <span />
              <span>Person</span>
              <span>Working on now</span>
              <span>Up next</span>
              <span>Delays</span>
              <span>Today</span>
              <span title="Time logged this week against the hours expected so far">Load this week</span>
            </div>

            {rows.map((p) => {
              const isOpen = !!open[p.id];
              const [stateLabel, stateColor] = STATE_LABEL[p.state];
              const tone = loadTone(p.load);
              const Chevron = isOpen ? ChevronDown : ChevronRight;
              return (
                <div key={p.id} className="flex flex-col shadow-[inset_0_-1px_0_rgb(243,244,246)]">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))}
                    className={`${GRID} min-h-[60px] w-full items-center bg-white px-4 py-2 text-left text-[13px] hover:bg-[rgb(249,250,251)]`}
                  >
                    <Chevron className="h-4 w-4 text-[rgb(84,100,144)]" />

                    <span className="flex min-w-0 items-center gap-2.5 overflow-hidden">
                      <span className={`h-8 w-8 shrink-0 rounded-full text-center text-[11px] font-semibold leading-8 ${avatarColorClasses(p.id)}`}>
                        {initials(p.name)}
                      </span>
                      <span className="flex min-w-0 flex-col gap-[3px]">
                        <span className="truncate text-[14px] font-semibold text-[rgb(13,27,62)]" title={p.name}>{p.name}</span>
                        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <Badge color={stateColor}>{stateLabel}</Badge>
                          {p.team && (
                            <span className="flex items-center gap-1 text-[11px] text-[rgb(84,100,144)]">
                              <span className="h-1.5 w-1.5 rounded-full" style={{ background: STAGE_DOT[p.team] }} />
                              {p.team}
                            </span>
                          )}
                        </span>
                      </span>
                    </span>

                    <span className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
                      {p.now ? (
                        <>
                          <span className="truncate text-[14px] font-medium text-[rgb(13,27,62)]" title={p.now.name}>{p.now.name}</span>
                          <span className="truncate text-[12px] text-[rgb(84,100,144)]" title={p.now.meta}>{p.now.meta}</span>
                        </>
                      ) : (
                        <span className="text-[13px] text-[rgb(138,151,181)]">Nothing logged yet today</span>
                      )}
                    </span>

                    <span className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
                      {p.next ? (
                        <>
                          <span className="truncate text-[rgb(13,27,62)]" title={p.next.name}>{p.next.name}</span>
                          <span className="text-[12px] text-[rgb(84,100,144)]">Due {fmtWeekday(p.next.due)}</span>
                        </>
                      ) : (
                        <span className="text-[13px] text-[rgb(138,151,181)]">Nothing scheduled</span>
                      )}
                    </span>

                    <span className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
                      {p.delayText ? (
                        <>
                          <span className="flex items-center gap-1.5 font-semibold text-[rgb(239,68,68)]">
                            <AlertCircle className="h-3 w-3" />
                            {p.delays > 0 ? `${p.delays} delayed` : "Waiting"}
                          </span>
                          <span className="truncate text-[12px] text-[rgb(84,100,144)]" title={p.delayText}>{p.delayText}</span>
                        </>
                      ) : (
                        <span className="text-[rgb(138,151,181)]">None</span>
                      )}
                    </span>

                    <span className="font-medium tabular-nums text-[rgb(13,27,62)]">
                      {formatMins(p.todayMinutes)}
                      <span className="block text-[11px] font-normal text-[rgb(84,100,144)]">logged</span>
                    </span>

                    <span className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-semibold tabular-nums" style={{ color: tone.fg }}>{p.load}%</span>
                      <span className="h-1 overflow-hidden rounded-full bg-[rgb(245,246,248)]">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${Math.min(p.load, 100)}%`, background: tone.bar }}
                        />
                      </span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 bg-[rgb(249,250,251)] pb-4 pl-[60px] pr-4 pt-1">
                      <MiniList title="Upcoming" items={p.upcoming} empty="No active deliverables." />
                      <MiniList title="Recent work" items={p.recent} empty="No work-sheet entries in the last two weeks." />
                      <div className="flex flex-col items-start gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenSheet?.(p.name)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-[rgb(245,246,248)] px-3.5 text-[12px] font-semibold text-[rgb(74,88,120)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] hover:bg-[rgb(243,244,246)]"
                        >
                          <List className="h-3.5 w-3.5" />
                          Open their work sheet
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {rows.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px] text-[rgb(84,100,144)]">
                No one matches this filter.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}