export default function PlaceholderPage({ title, phase }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="max-w-md text-sm text-slate-500">
        Coming in {phase}. This tab is planned but not built yet.
      </p>
    </div>
  );
}
