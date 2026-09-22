// Skeleton loading screens.
//
// Every screen of the app shows one of these instead of a spinner or a line of
// "Loading..." text. Each mirrors the layout of the screen it stands in for
// (same page padding, header height, card and row sizes), so when the real
// content arrives it replaces the placeholder in the same place and nothing
// jumps.
//
// - Built on the shadcn `Skeleton` primitive; `Bone` only fixes the colour so it
//   reads the same on every page.
// - Purely presentational: no data, no random widths (widths cycle through a
//   fixed list) so a skeleton renders identically every time.
// - Announced to screen readers as one "Loading ..." status instead of dozens
//   of empty boxes; the pulse stops for people who prefer reduced motion.

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { COLUMN_WIDTHS, buildGridTemplateColumns } from "@/constants/worksheetColumnWidths";

// ------------------------------------------------------------ primitives

export const Bone = ({ className, ...props }) => (
  <Skeleton
    className={cn("bg-slate-200/80 motion-reduce:animate-none", className)}
    {...props}
  />
);

const WIDTHS = ["w-24", "w-32", "w-20", "w-28", "w-16", "w-36", "w-24", "w-20"];
const widthAt = (index) => WIDTHS[index % WIDTHS.length];

// One accessible "loading" landmark around a whole placeholder.
export const SkeletonScreen = ({ label = "Loading", testId, className, children }) => (
  <div
    role="status"
    aria-busy="true"
    aria-live="polite"
    data-testid={testId}
    className={className}
  >
    <span className="sr-only">{label}...</span>
    {children}
  </div>
);

// Same frame every page uses (see e.g. ProjectsPage / ClientsPage).
const PageFrame = ({ label, testId, children }) => (
  <SkeletonScreen
    label={label}
    testId={testId}
    className="flex-1 overflow-auto bg-[#f7f9fc] px-6 py-6 lg:px-8"
  >
    {children}
  </SkeletonScreen>
);

const Card = ({ className, children }) => (
  <div className={cn("rounded-xl border border-border bg-white", className)}>{children}</div>
);

// ------------------------------------------------------------ building blocks

export const PageHeaderSkeleton = ({ action = true, subtitle = true, titleWidth = "w-40" }) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <Bone className={cn("h-8", titleWidth)} />
      {subtitle && <Bone className="mt-2.5 h-4 w-72 max-w-full" />}
    </div>
    {action && <Bone className="h-10 w-36 rounded-lg" />}
  </div>
);

export const StatCardsSkeleton = ({ count = 4 }) => (
  <div
    className={cn(
      "mb-6 grid grid-cols-2 gap-4",
      count === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"
    )}
  >
    {Array.from({ length: count }, (_, i) => (
      <Card key={i} className="p-4">
        <Bone className="h-3 w-24" />
        <Bone className="mt-3 h-8 w-16" />
      </Card>
    ))}
  </div>
);

// A bordered table: header cells, then `rows` rows. The first column carries an
// avatar + name, which suits every people/record list in the app.
//   bare   - no outer border/background, for use inside a card or table that already has one
//   header - draw the header row (false when the real header is already on screen)
export const TableSkeleton = ({
  columns = 6,
  rows = 8,
  avatar = true,
  bare = false,
  header = true,
  className,
}) => {
  const Wrapper = bare ? "div" : Card;
  return (
  <Wrapper className={cn(!bare && "overflow-hidden", className)}>
    {header && (
      <div
        className="grid items-center gap-4 border-b border-border bg-slate-50/70 px-4 py-3"
        style={{ gridTemplateColumns: `2fr repeat(${columns - 1}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }, (_, i) => (
          <Bone key={i} className={cn("h-3", i === 0 ? "w-20" : "w-14")} />
        ))}
      </div>
    )}

    {Array.from({ length: rows }, (_, row) => (
      <div
        key={row}
        className="grid items-center gap-4 border-b border-border px-4 py-4 last:border-b-0"
        style={{ gridTemplateColumns: `2fr repeat(${columns - 1}, minmax(0, 1fr))` }}
      >
        <div className="flex items-center gap-3">
          {avatar && <Bone className="h-8 w-8 shrink-0 rounded-full" />}
          <Bone className={cn("h-4", widthAt(row))} />
        </div>
        {Array.from({ length: columns - 1 }, (_, col) => (
          <Bone key={col} className={cn("h-4", widthAt(row + col + 1))} />
        ))}
      </div>
    ))}
  </Wrapper>
  );
};

// A generic column of cards, used inside board columns.
const BoardCardSkeleton = ({ index }) => (
  <div className="rounded-xl border border-border bg-white p-4">
    <div className="flex items-center justify-between">
      <Bone className="h-4 w-4 rounded" />
      <Bone className="h-5 w-16 rounded-md" />
    </div>
    <Bone className="mt-3 h-4 w-11/12" />
    <Bone className={cn("mt-2 h-4", index % 2 ? "w-2/3" : "w-3/4")} />
    <div className="mt-3 space-y-2">
      <Bone className="h-3 w-1/2" />
      <Bone className="h-3 w-2/5" />
    </div>
    <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
      <Bone className="h-6 w-6 rounded-full" />
      <Bone className="h-3 w-12" />
    </div>
  </div>
);

// A Kanban board: the same column shell as ui/KanbanColumn.
export const KanbanSkeleton = ({
  columns = 4,
  cards = 3,
  minWidth = "1360px",
  columnWidth = "320px",
}) => (
  <div className="overflow-x-auto pb-4">
    <div className="flex items-start gap-4" style={{ minWidth }}>
      {Array.from({ length: columns }, (_, col) => (
        <div
          key={col}
          className="flex shrink-0 flex-col rounded-xl border border-border bg-[#f7f9fc]"
          style={{ width: columnWidth, minWidth: columnWidth }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-white px-4 py-3">
            <div className="flex items-center gap-2">
              <Bone className="h-2 w-2 rounded-full" />
              <Bone className="h-4 w-24" />
              <Bone className="h-5 w-7 rounded-full" />
            </div>
            <Bone className="h-4 w-4 rounded" />
          </div>
          <div className="flex min-h-[560px] flex-col gap-3 p-3">
            {Array.from({ length: Math.max(1, cards - (col % 3)) }, (_, i) => (
              <BoardCardSkeleton key={i} index={i + col} />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const ListPanelSkeleton = ({ rows = 5, titleWidth = "w-40" }) => (
  <Card className="p-5">
    <div className="mb-4 flex items-center justify-between">
      <Bone className={cn("h-4", titleWidth)} />
      <Bone className="h-8 w-28 rounded-lg" />
    </div>
    <div className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="rounded-lg border border-border p-3">
          <Bone className={cn("h-4", i % 2 ? "w-2/3" : "w-3/4")} />
          <div className="mt-2 flex items-center gap-2">
            <Bone className="h-5 w-16 rounded-md" />
            <Bone className="h-5 w-20 rounded-md" />
            <Bone className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  </Card>
);

// ------------------------------------------------------------ full screens

// Content-only placeholders: for pages whose header is real from the first
// paint and only the data area waits.

export const ProjectsBoardSkeleton = () => (
  <SkeletonScreen label="Loading projects" testId="projects-loading-state">
    <KanbanSkeleton columns={6} cards={3} minWidth="1920px" />
  </SkeletonScreen>
);

export const ApprovalsBoardSkeleton = () => (
  <SkeletonScreen label="Loading approvals" testId="approvals-loading-state">
    <KanbanSkeleton columns={4} cards={2} minWidth="1360px" />
  </SkeletonScreen>
);

export const EfficiencyContentSkeleton = () => (
  <SkeletonScreen label="Loading efficiency" testId="efficiency-loading-state">
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="p-4">
            <Bone className="h-3 w-28" />
            <Bone className="mt-3 h-8 w-20" />
            <Bone className="mt-3 h-3 w-32" />
          </Card>
        ))}
      </div>
      <TableSkeleton columns={9} rows={7} />
    </div>
  </SkeletonScreen>
);

export const SettingsTableSkeleton = ({ columns = 6, rows = 8, label = "Loading" }) => (
  <SkeletonScreen label={label} testId="settings-loading-state">
    <TableSkeleton columns={columns} rows={rows} />
  </SkeletonScreen>
);

export const ClientsListSkeleton = () => (
  <SkeletonScreen label="Loading clients" testId="clients-loading-state">
    <TableSkeleton columns={5} rows={8} bare header={false} />
  </SkeletonScreen>
);

export const TeamListSkeleton = () => (
  <SkeletonScreen label="Loading team" testId="team-loading-state">
    <TableSkeleton columns={6} rows={9} bare />
  </SkeletonScreen>
);

export const WorkSheetTableSkeleton = ({ rows = 14 }) => {
  const columns = Object.keys(COLUMN_WIDTHS);
  const template = buildGridTemplateColumns(columns);
  const cellWidths = ["w-20", "w-24", "w-28", "w-20", "w-16", "w-24", "w-14"];

  return (
    <SkeletonScreen
      label="Loading rows"
      testId="worksheet-loading-state"
      className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-white"
    >
      <div className="grid items-center border-b border-border bg-[#f7f9fc]" style={{ gridTemplateColumns: template }}>
        <div className="h-10 border-r border-slate-200" />
        <div className="h-10 border-r border-slate-200" />
        <div className="h-10 border-r border-slate-200" />
        {columns.map((column) => (
          <div key={column} className="flex h-10 items-center justify-center border-r border-slate-200 px-2">
            <Bone className="h-3 w-16" />
          </div>
        ))}
      </div>

      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="grid items-center border-b border-slate-100"
          style={{ gridTemplateColumns: template }}
        >
          <div className="flex h-11 items-center justify-center border-r border-slate-100">
            <Bone className="h-3 w-4" />
          </div>
          <div className="flex h-11 items-center justify-center border-r border-slate-100">
            <Bone className="h-4 w-4 rounded" />
          </div>
          <div className="flex h-11 items-center justify-center gap-1 border-r border-slate-100">
            <Bone className="h-5 w-5 rounded" />
            <Bone className="h-5 w-5 rounded" />
          </div>
          {columns.map((column, col) => (
            <div key={column} className="flex h-11 items-center border-r border-slate-100 px-3">
              <Bone className={cn("h-4", cellWidths[(row + col) % cellWidths.length])} />
            </div>
          ))}
        </div>
      ))}
    </SkeletonScreen>
  );
};

// Whole-page placeholders: for pages that show nothing until data arrives.

export const WorkSheetSkeleton = () => (
  <SkeletonScreen
    label="Loading work sheet"
    testId="worksheet-page-skeleton"
    className="flex min-h-0 flex-1 flex-col gap-4 bg-[#f7f9fc] p-4"
  >
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Bone className="h-9 w-28 rounded-lg" />
        <Bone className="h-9 w-28 rounded-lg" />
        <Bone className="h-9 w-24 rounded-lg" />
      </div>
      <div className="flex items-center gap-2">
        <Bone className="h-9 w-56 rounded-lg" />
        <Bone className="h-9 w-24 rounded-lg" />
      </div>
    </div>
    <WorkSheetTableSkeleton />
  </SkeletonScreen>
);

export const DashboardSkeleton = () => (
  <PageFrame label="Loading dashboard" testId="dashboard-loading-state">
    <PageHeaderSkeleton action={false} />
    <StatCardsSkeleton count={4} />
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div className="space-y-5 xl:col-span-2">
        <Card>
          <div className="border-b border-border px-5 py-4">
            <Bone className="h-4 w-56" />
            <Bone className="mt-2 h-3 w-80 max-w-full" />
          </div>
          <div className="space-y-4 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i}>
                <div className="mb-2 flex justify-between">
                  <Bone className="h-3 w-24" />
                  <Bone className="h-3 w-10" />
                </div>
                <Bone className="h-2.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </Card>
        <TableSkeleton columns={5} rows={5} avatar={false} />
      </div>
      <ListPanelSkeleton rows={5} titleWidth="w-32" />
    </div>
  </PageFrame>
);

export const ProjectDetailSkeleton = () => (
  <PageFrame label="Loading project" testId="project-detail-loading-state">
    <Bone className="mb-4 h-4 w-32" />
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <Bone className="h-3 w-24" />
        <Bone className="mt-2.5 h-8 w-80 max-w-full" />
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <Bone className="h-3 w-28" />
          <Bone className="h-3 w-24" />
          <Bone className="h-3 w-44" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Bone className="h-10 w-10 rounded-lg" />
        <Bone className="h-10 w-10 rounded-lg" />
        <Bone className="h-10 w-32 rounded-lg" />
      </div>
    </div>
    <StatCardsSkeleton count={3} />
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <ListPanelSkeleton rows={5} titleWidth="w-32" />
      <ListPanelSkeleton rows={4} titleWidth="w-40" />
    </div>
  </PageFrame>
);

// The app shell itself (sidebar + top bar + a generic page) - shown while the
// app is still finding out who is signed in, before any page is known.
export const AppShellSkeleton = () => (
  <SkeletonScreen
    label="Loading"
    testId="app-loading-state"
    className="flex h-screen bg-[#f7f9fc]"
  >
    <aside className="hidden w-60 shrink-0 flex-col justify-between bg-[#0b1e39] p-4 md:flex">
      <div>
        <div className="mb-8 flex items-center gap-2">
          <Bone className="h-8 w-8 rounded-lg bg-white/15" />
          <Bone className="h-4 w-16 bg-white/15" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2">
              <Bone className="h-4 w-4 rounded bg-white/15" />
              <Bone className={cn("h-3.5 bg-white/15", i % 2 ? "w-24" : "w-20")} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Bone className="h-9 w-9 rounded-full bg-white/15" />
        <div className="space-y-1.5">
          <Bone className="h-3 w-24 bg-white/15" />
          <Bone className="h-2.5 w-14 bg-white/15" />
        </div>
      </div>
    </aside>

    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
        <Bone className="h-4 w-28" />
        <div className="flex items-center gap-2">
          <Bone className="h-9 w-28 rounded-lg" />
          <Bone className="h-9 w-9 rounded-full" />
        </div>
      </header>
      <div className="flex-1 overflow-hidden px-6 py-6 lg:px-8">
        <PageHeaderSkeleton />
        <StatCardsSkeleton count={4} />
        <TableSkeleton columns={6} rows={6} />
      </div>
    </div>
  </SkeletonScreen>
);

// A few rows for a preview table inside a dialog (e.g. while a file is checked).
export const DialogRowsSkeleton = ({ rows = 5 }) => (
  <SkeletonScreen label="Checking file" testId="dialog-loading-state" className="space-y-2">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3 rounded-lg border border-border px-3 py-3">
        <Bone className="h-4 w-6" />
        <Bone className={cn("h-4", widthAt(i + 2))} />
        <Bone className="h-4 w-28" />
        <Bone className="ml-auto h-5 w-16 rounded-md" />
      </div>
    ))}
  </SkeletonScreen>
);