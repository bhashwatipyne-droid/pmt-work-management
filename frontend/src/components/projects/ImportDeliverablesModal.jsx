import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";

import { importDeliverables } from "@/services/api";
import { DialogRowsSkeleton } from "@/components/skeletons/Skeletons";
import { trackEvent } from "../../analytics";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPT = ".csv,.xlsx";

const STATUS_STYLE = {
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  skipped: "bg-slate-100 text-slate-600 border-slate-200",
  error: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_LABEL = { ok: "Ready", skipped: "Skipped", error: "Fix" };

const csvCell = (value) => {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// The sheet the admin is asked to fill in. Example rows use real type names from
// this app so a copy-paste of the example already imports.
const buildTemplate = (deliverableTypes) => {
  // Prefer two everyday deliverables as the examples; fall back to whatever the
  // list starts with if this workspace has renamed them.
  const first = deliverableTypes.includes("Carousel")
    ? "Carousel"
    : deliverableTypes[0] || "Carousel";
  const second = deliverableTypes.includes("Reel / Short Video")
    ? "Reel / Short Video"
    : deliverableTypes[1] || first;
  const rows = [
    ["Name", "Type", "Start date", "End date", "Stages", "Approvals"],
    ["Diwali carousel", first, "2026-10-20", "2026-10-25", "Content, Design", ""],
    ["Festive reel", second, "2026-10-22", "2026-10-30", "Content, Design, Animate", "Leadership"],
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
};

const downloadTemplate = (deliverableTypes) => {
  const blob = new Blob([buildTemplate(deliverableTypes)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "deliverables-import-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const ImportDeliverablesModal = ({
  open,
  projectId,
  deliverableTypes = [],
  onClose,
  onImported,
}) => {
  const [file, setFile] = useState(null);
  const [report, setReport] = useState(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const inputRef = useRef(null);

  const reset = () => {
    setFile(null);
    setReport(null);
    setError("");
    setChecking(false);
    setImporting(false);
    setDragging(false);
    setOnlyProblems(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  // Start clean every time the dialog is opened.
  useEffect(() => {
    if (open) reset();
  }, [open]);

  const close = () => {
    if (importing) return;
    onClose?.();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, importing]);

  const visibleRows = useMemo(() => {
    const rows = report?.rows || [];
    if (!onlyProblems) return rows;
    return rows.filter((r) => r.status !== "ok" || r.warnings.length > 0);
  }, [report, onlyProblems]);

  if (!open) return null;

  const handleFile = async (selected) => {
    if (!selected) return;

    const name = selected.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".xlsx")) {
      setError("Only .csv and .xlsx files can be imported.");
      return;
    }
    if (selected.size > MAX_BYTES) {
      setError("The file is larger than 2 MB. Split it into smaller files.");
      return;
    }

    setFile(selected);
    setReport(null);
    setError("");
    setChecking(true);

    try {
      const result = await importDeliverables(projectId, selected, true);
      setReport(result);
      trackEvent("deliverable_import_checked", {
        project_id: projectId,
        rows: result.counts?.total,
        ok: result.counts?.ok,
        errors: result.counts?.errors,
      });
    } catch (err) {
      setFile(null);
      setError(err?.response?.data?.detail || "Could not read this file.");
    } finally {
      setChecking(false);
    }
  };

  const handleImport = async () => {
    if (!file || !report?.counts?.ok) return;
    setImporting(true);
    setError("");

    try {
      const result = await importDeliverables(projectId, file, false);
      const skipped = (result.counts?.errors || 0) + (result.counts?.skipped || 0);
      toast.success(
        `${result.created} deliverable${result.created === 1 ? "" : "s"} imported` +
          (skipped ? ` (${skipped} skipped)` : "")
      );
      trackEvent("deliverables_imported", {
        project_id: projectId,
        created: result.created,
        skipped,
      });
      onImported?.();
      onClose?.();
    } catch (err) {
      setError(err?.response?.data?.detail || "Import failed. Nothing was saved.");
    } finally {
      setImporting(false);
    }
  };

  const counts = report?.counts;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-deliverables-title"
        data-testid="import-deliverables-modal"
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0f0fd] text-[#2b2bb5]">
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </span>
            <span>Deliverables</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span id="import-deliverables-title" className="font-medium text-foreground">
              Import from CSV or Excel
            </span>
          </div>

          <button
            type="button"
            onClick={close}
            disabled={importing}
            aria-label="Close"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {!file && !checking && (
            <>
              <div
                data-testid="import-deliverables-dropzone"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  handleFile(e.dataTransfer.files?.[0]);
                }}
                className={[
                  "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
                  dragging
                    ? "border-[#2b2bb5] bg-[#f0f0fd]"
                    : "border-border bg-[#fafbff]",
                ].join(" ")}
              >
                <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#f0f0fd] text-[#2b2bb5]">
                  <Upload className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium text-foreground">
                  Drop a .csv or .xlsx file here
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Up to 500 rows and 2 MB. You will see a preview before anything is saved.
                </p>
                <button
                  type="button"
                  data-testid="import-deliverables-browse"
                  onClick={() => inputRef.current?.click()}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#23239b] focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/30"
                >
                  Choose file
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT}
                  data-testid="import-deliverables-input"
                  className="sr-only"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </div>

              <div className="mt-5 rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Columns</h3>
                  <button
                    type="button"
                    data-testid="import-deliverables-template"
                    onClick={() => downloadTemplate(deliverableTypes)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#dcdcf8] bg-[#f0f0fd] px-3 py-1.5 text-xs font-semibold text-[#1a1a8a] transition-colors hover:bg-[#dcdcf8]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download template
                  </button>
                </div>
                <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  <li>
                    <span className="font-semibold text-foreground">Name</span> (required) - the
                    deliverable's name.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Type</span> - one of your
                    deliverable types, for example Carousel or Reel / Short Video. This is what
                    fills time on the Work Sheet.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Start date / End date</span>{" "}
                    - 2026-10-25 or 25/10/2026 (day first).
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Stages</span> - Content,
                    Design, Animate, separated by commas. Blank means Content.
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">Approvals</span> - extra
                    approvals: Leadership, Client SPOC, Compliance. Manager approval is always
                    included.
                  </li>
                </ul>
              </div>
            </>
          )}

          {checking && (
            <div>
              <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking {file?.name}...
              </p>
              <DialogRowsSkeleton rows={6} />
            </div>
          )}

          {error && (
            <div
              role="alert"
              data-testid="import-deliverables-error"
              className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {report && !checking && (
            <div data-testid="import-deliverables-preview">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">{file?.name}</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  {counts.ok} ready
                </span>
                {counts.skipped > 0 && (
                  <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                    {counts.skipped} skipped
                  </span>
                )}
                {counts.errors > 0 && (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700">
                    {counts.errors} need fixing
                  </span>
                )}

                <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={onlyProblems}
                    onChange={(e) => setOnlyProblems(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 accent-[#2b2bb5]"
                  />
                  Only rows with notes
                </label>
              </div>

              {report.ignored_columns?.length > 0 && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Ignored columns: {report.ignored_columns.join(", ")}
                </p>
              )}

              <div className="overflow-hidden rounded-xl border border-border">
                <div className="max-h-[380px] overflow-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Row</th>
                        <th className="px-3 py-2 font-semibold">Name</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Dates</th>
                        <th className="px-3 py-2 font-semibold">Stages</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr
                          key={row.row}
                          data-testid={`import-row-${row.row}`}
                          className="border-t border-border align-top"
                        >
                          <td className="px-3 py-2 text-muted-foreground">{row.row}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-foreground">{row.name || "-"}</div>
                            {[...row.errors].map((message) => (
                              <div key={message} className="mt-0.5 text-rose-700">
                                {message}
                              </div>
                            ))}
                            {row.warnings.map((message) => (
                              <div key={message} className="mt-0.5 text-amber-700">
                                {message}
                              </div>
                            ))}
                          </td>
                          <td className="px-3 py-2 text-foreground">{row.type || "-"}</td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {row.start_dt || row.end_dt
                              ? `${row.start_dt || "?"} → ${row.end_dt || "?"}`
                              : "-"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {row.required_stages.join(", ") || "-"}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[row.status]}`}
                            >
                              {STATUS_LABEL[row.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {visibleRows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                            <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-600" />
                            Every row is ready with no notes.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {counts.errors > 0 && counts.ok > 0 && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Rows marked Fix are left out. Import the ready rows now and upload the fixed
                  ones afterwards - rows already in the project are skipped, so nothing doubles.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={reset}
            disabled={!file || importing}
            className="rounded-lg px-3 py-2 text-sm font-medium text-[#2b2bb5] transition-colors hover:bg-[#f0f0fd] disabled:invisible"
          >
            Choose a different file
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={close}
              disabled={importing}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="import-deliverables-confirm"
              onClick={handleImport}
              disabled={!counts?.ok || importing || checking}
              className="inline-flex items-center gap-2 rounded-lg bg-[#2b2bb5] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30 disabled:cursor-not-allowed disabled:bg-[#f0f0fd] disabled:text-[#c8d5ee]"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {counts?.ok
                ? `Import ${counts.ok} deliverable${counts.ok === 1 ? "" : "s"}`
                : "Import"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};