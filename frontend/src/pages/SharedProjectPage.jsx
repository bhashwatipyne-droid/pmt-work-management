import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ClipboardCopy, Loader2, NotebookPen, X } from "lucide-react";
import { toast } from "sonner";
import { getSharedProject } from "@/services/api";
import { APP_ACTIONS, requestAppAction, setQuickLogPreset } from "@/lib/appActions";
import { chipFor, sharedProjectText } from "@/lib/sharedProject";
import { useUser } from "@/context/UserContext";

// Where a shared project link (the one pasted into WhatsApp) lands: a modal
// with the project's deliverables, readable without signing in. "Log work"
// takes a signed-in person to the quick logger on that project (anyone else is
// asked to sign in first); "Copy to clipboard" copies the list as text.
export default function SharedProjectPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useUser();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    getSharedProject(token)
      .then((d) => !cancelled && setData(d))
      .catch(
        (e) =>
          !cancelled &&
          setError(
            e.response?.status === 404
              ? "This link is no longer available."
              : "Could not load this project. Check your connection and try again."
          )
      );
    return () => {
      cancelled = true;
    };
  }, [token]);

  const close = () => navigate("/");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sharedProjectText(data, window.location.href));
      toast.success("Copied to clipboard");
    } catch (_) {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  };

  const logWork = () => {
    setQuickLogPreset(data.project_id);
    requestAppAction(APP_ACTIONS.QUICK_LOG);
    // Not signed in yet: "/" shows the sign-in page, and the logger opens on
    // this project once the Work Sheet loads.
    navigate("/");
  };

  const pct = data?.total ? Math.round((100 * data.done) / data.total) : 0;
  const sub = data ? [data.client, data.status, data.timeline].filter(Boolean).join(" · ") : "";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[rgb(13,27,62)]/50 p-3 sm:p-6"
      data-testid="shared-project-page"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={data ? `Project ${data.name}` : "Shared project"}
        className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        {!data && !error && (
          <div className="flex items-center justify-center gap-2 p-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading project…
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-4 p-12 text-center">
            <p className="text-sm text-slate-700">{error}</p>
            <button
              type="button"
              onClick={close}
              className="h-9 rounded-md bg-[#2b2bb5] px-4 text-sm font-semibold text-white hover:bg-[#1a1a8a]"
            >
              Open PMT
            </button>
          </div>
        )}

        {data && (
          <>
            <div className="flex items-start gap-3 px-5 pb-3 pt-5 sm:px-6">
              <div className="min-w-0 flex-1">
                <h1 className="m-0 text-xl font-bold leading-7 text-[rgb(13,27,62)] [text-wrap:pretty] sm:text-2xl">
                  {data.name}
                </h1>
                {sub && <p className="m-0 mt-0.5 text-sm text-[rgb(84,100,144)]">{sub}</p>}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                title="Open PMT"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 px-5 pb-3 text-[13px] text-[rgb(84,100,144)] sm:px-6">
              <span className="shrink-0">
                {data.done} of {data.total} deliverables done
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-[rgb(238,240,244)]">
                <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </span>
              <span className="shrink-0">{pct}%</span>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 pb-4 sm:px-6" data-testid="shared-project-table">
              {data.rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No deliverables yet.</p>
              ) : (
                <table className="w-full min-w-[620px] border-collapse overflow-hidden rounded-xl text-left text-[14px]">
                  <thead>
                    <tr className="bg-[#00205b] text-[13px] text-white">
                      <th className="w-10 px-3 py-2.5 font-bold">#</th>
                      <th className="px-3 py-2.5 font-bold">Deliverable</th>
                      <th className="px-3 py-2.5 font-bold">Type</th>
                      <th className="px-3 py-2.5 font-bold">Stage</th>
                      <th className="px-3 py-2.5 font-bold">Status</th>
                      <th className="px-3 py-2.5 font-bold">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => {
                      const chip = chipFor(row.status);
                      return (
                        <tr key={i} className={i % 2 ? "bg-[#f7f9fc]" : "bg-white"}>
                          <td className="border-b border-slate-200 px-3 py-2.5 align-top text-[rgb(84,100,144)]">{i + 1}</td>
                          <td className="border-b border-slate-200 px-3 py-2.5 align-top text-[rgb(13,27,62)]">{row.name}</td>
                          <td className="border-b border-slate-200 px-3 py-2.5 align-top text-[rgb(13,27,62)]">{row.type}</td>
                          <td className="border-b border-slate-200 px-3 py-2.5 align-top text-[rgb(13,27,62)]">{row.stage}</td>
                          <td className="border-b border-slate-200 px-3 py-2.5 align-top">
                            <span
                              className="inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-semibold"
                              style={{ background: chip.bg, color: chip.fg }}
                            >
                              {chip.label}
                            </span>
                          </td>
                          <td className="whitespace-nowrap border-b border-slate-200 px-3 py-2.5 align-top text-[rgb(13,27,62)]">{row.due}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-6">
              <span className="text-xs text-slate-500">
                {isAuthenticated ? "Shared from PMT" : "Sign in to log work on this project"}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copy}
                  data-testid="shared-project-copy"
                  className="flex h-9 items-center gap-2 rounded-md bg-white px-3.5 text-sm font-semibold text-[rgb(13,27,62)] shadow-[inset_0_0_0_1px_rgb(203,213,225)] hover:bg-slate-50"
                >
                  <ClipboardCopy className="h-4 w-4" />
                  Copy to clipboard
                </button>
                <button
                  type="button"
                  onClick={logWork}
                  data-testid="shared-project-log-work"
                  className="flex h-9 items-center gap-2 rounded-md bg-[#2b2bb5] px-3.5 text-sm font-semibold text-white hover:bg-[#1a1a8a]"
                >
                  <NotebookPen className="h-4 w-4" />
                  Log work
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
