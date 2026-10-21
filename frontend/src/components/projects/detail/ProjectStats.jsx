import { Dot } from "@/components/projects/detail/parts";
import { HAIRLINE, fmtMin } from "@/components/projects/detail/projectDetailView";

export function ProjectStats({ done, loggedMinutes, pct, segments, setStageFilter, setTab, stageFilter, statsRef, tiles, total }) {
  return (
    <>
    {/* Progress + stage tiles. Sticky on desktop so the numbers and stage
        filters stay in view while scrolling a long deliverables list. */}
    <div
      ref={statsRef}
      data-testid="project-detail-stats"
      className="z-20 -mx-4 bg-white px-4 py-2 md:sticky md:top-0 md:-mx-6 md:px-6"
    >
    <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))] md:overflow-x-auto">
      <div
        className={`col-span-2 flex min-w-0 flex-col gap-3 rounded-xl bg-white p-4 md:col-span-1 ${HAIRLINE}`}
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-2xl font-semibold leading-8 text-[rgb(13,27,62)]">
            {pct}%
          </span>
          <span className="text-[13px] text-[rgb(84,100,144)]">
            {done} of {total} deliverables done · {fmtMin(loggedMinutes)} logged
          </span>
        </div>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-[rgb(245,246,248)]">
          {segments.map((s) => (
            <span
              key={s.key}
              title={s.label}
              style={{ flex: s.n, background: s.color }}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3.5 gap-y-1.5">
          {segments.map((s) => (
            <span
              key={s.key}
              className="flex items-center gap-1.5 text-xs text-[rgb(74,88,120)]"
            >
              <Dot color={s.color} />
              {s.label} <span className="text-[rgb(84,100,144)]">{s.n}</span>
            </span>
          ))}
        </div>
      </div>

      {tiles.map((t) => {
        const on = stageFilter === t.key;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={on}
            onClick={() => {
              setStageFilter(t.key);
              setTab("deliverables");
            }}
            className={`flex min-w-0 flex-col gap-1.5 rounded-xl p-4 text-left transition-[box-shadow,background] duration-100 ${
              on
                ? "bg-[rgb(240,240,253)] shadow-[inset_0_0_0_2px_rgb(43,43,181)]"
                : "bg-white shadow-[inset_0_0_0_1px_rgb(234,238,244)] hover:shadow-[inset_0_0_0_1px_rgb(144,144,236)]"
            }`}
          >
            <span className="flex items-center gap-2 text-[13px] font-semibold text-[rgb(74,88,120)]">
              <Dot color={t.dot} />
              {t.label}
            </span>
            <span className="text-2xl font-semibold leading-8 text-[rgb(13,27,62)]">
              {t.count}
            </span>
            <span className="text-xs text-[rgb(84,100,144)]">{t.done} done</span>
          </button>
        );
      })}
    </div>
    </div>
    </>
  );
}
