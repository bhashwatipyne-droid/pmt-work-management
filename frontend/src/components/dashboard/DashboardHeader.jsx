import { BTN_PRIMARY, BTN_SECONDARY, EYEBROW } from "./dashboardTheme";
import { Filter, Plus, X } from "lucide-react";
import { MonthPicker } from "@/components/work-sheet/MonthPicker";
import { TEAMS, currentMonth } from "@/lib/homeDashboard";

export function DashboardHeader(ctx) {
  const { activeN, chips, fieldDefs, filters, filtersOpen, h, label, month, navigate, scopeNote, setCat, setFilter, setFilters, setFiltersOpen, setMonth, setTeam, team } = ctx;
  return (
    <>
    {/* ---------------- Header ---------------- */}
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="flex min-w-[240px] flex-1 flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold leading-9 text-[rgb(13,27,62)]">Home</h1>
          <p className="m-0 text-[14px] text-[rgb(84,100,144)] [text-wrap:pretty]">
            {label} · {scopeNote} · {h.total} deliverables · {h.projectCount} projects ({h.spilledProjectCount} spilled over from earlier months) · {activeN} active
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Month */}
          {/* Same picker as the Work Sheet: click the month to choose one from
              a grid. Home has no "All months" and cannot go past this month. */}
          <MonthPicker
            value={month}
            onChange={(next) => next && setMonth(next)}
            currentMonth={currentMonth()}
            maxMonth={currentMonth()}
            allowAll={false}
            testId="home-month-picker"
          />

          {/* Filters */}
          <span className="relative flex">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
              className="flex h-8 items-center gap-1.5 rounded-[7px] bg-white px-2.5 text-[13px] font-medium text-[rgb(74,88,120)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] hover:bg-[rgb(249,250,251)]"
            >
              <Filter className="h-3.5 w-3.5" />
              Filters
              {chips.length > 0 && (
                <span className="box-border h-[18px] min-w-[18px] rounded-full bg-[rgb(43,43,181)] px-[5px] text-center font-['Manrope','Inter',sans-serif] text-[11px] font-semibold leading-[18px] text-white">
                  {chips.length}
                </span>
              )}
            </button>
            {filtersOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFiltersOpen(false)} />
                <div role="dialog" aria-label="Filters" className="absolute right-0 top-[calc(100%+6px)] z-[41] flex w-[300px] flex-col gap-3 rounded-xl bg-white p-3.5 shadow-[0_0_0_1px_rgb(234,238,244),0_6px_25px_rgba(13,28,61,0.12)]">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[14px] font-semibold text-[rgb(13,27,62)]">Filters</span>
                    <span className="text-[12px] text-[rgb(84,100,144)]">Applies to every section on Home</span>
                  </div>
                  {fieldDefs.map((f) => (
                    <label key={f.key} className="flex flex-col gap-1 text-[12px] font-medium text-[rgb(74,88,120)]">
                      {f.label}
                      <select
                        value={filters[f.key] || ""}
                        onChange={(e) => setFilter(f.key, e.target.value)}
                        className="h-[34px] rounded-[7px] border-none bg-white px-2 text-[13px] font-normal text-[rgb(13,27,62)] shadow-[inset_0_0_0_1px_rgb(239,240,242)] outline-none"
                      >
                        <option value="">{f.all}</option>
                        {f.opts.map(([v, t]) => (
                          <option key={v} value={v}>{t}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <div className="flex justify-between gap-2 pt-1">
                    <button type="button" className={BTN_SECONDARY} onClick={() => setFilters({})}>Reset</button>
                    <button type="button" className={BTN_PRIMARY} onClick={() => setFiltersOpen(false)}>Done</button>
                  </div>
                </div>
              </>
            )}
          </span>

          <button type="button" className={BTN_PRIMARY} onClick={() => navigate("/projects", { state: { openCreate: true } })}>
            <Plus className="h-3.5 w-3.5" />
            New project
          </button>
        </div>
      </div>

      {/* Team view */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={EYEBROW}>Team view</span>
        <div role="radiogroup" aria-label="Team view" className="flex rounded-lg bg-[rgb(245,246,248)] p-0.5">
          {["All", ...TEAMS].map((t) => {
            const on = team === t;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setTeam(t);
                  setCat("all");
                }}
                className={`h-7 rounded-[7px] px-3 text-[12px] font-semibold ${
                  on ? "bg-white text-[rgb(13,27,62)] shadow-[0_1px_2px_0_rgba(13,28,61,0.05)]" : "text-[rgb(84,100,144)]"
                }`}
              >
                {t === "All" ? "All teams" : t}
              </button>
            );
          })}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-label="Remove filter"
              onClick={() => setFilter(c.key, "")}
              className="flex h-7 items-center gap-1.5 rounded-full bg-[rgb(240,240,253)] pl-2.5 pr-2 text-[12px] font-semibold text-[rgb(26,26,138)] shadow-[inset_0_0_0_1px_rgb(144,144,236)]"
            >
              {c.label}
              <X className="h-2.5 w-2.5" />
            </button>
          ))}
          <button type="button" onClick={() => setFilters({})} className="h-7 rounded-[7px] px-2 text-[12px] font-semibold text-[rgb(84,100,144)] hover:text-[rgb(13,27,62)]">
            Clear all
          </button>
        </div>
      )}
    </div>
    </>
  );
}
