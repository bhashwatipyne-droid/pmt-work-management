import { useEffect, useState } from "react";
import { Copy, Link2, MessageCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { getProjectShare, startProjectShare, stopProjectShare } from "@/services/api";

// "Send this project on WhatsApp". The project gets one public, read-only link;
// pasted into WhatsApp it unfurls into a card with an image of the deliverables
// table (the same thing the team used to screenshot from the sheet).
export default function ShareProjectModal({ open, onClose, project, userId }) {
  const [share, setShare] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setShare(null);
    setError("");
    setLoading(true);
    // Open the dialog straight on a working link: sharing is what the button
    // is for, so it starts (or reuses) the project's link.
    startProjectShare(userId, project.id)
      .then((data) => !cancelled && setShare(data))
      .catch((e) => !cancelled && setError(e.response?.data?.detail || "Could not create the link."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, project?.id, userId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const whatsappText = share ? `${project.name}\n${share.url}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share.url);
      toast.success("Link copied");
    } catch (_) {
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await stopProjectShare(userId, project.id);
      setShare(null);
      toast.success("Sharing stopped. The link no longer works.");
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not stop sharing.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-project-title"
        data-testid="share-project-modal"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f0f0fd]">
            <Link2 className="h-5 w-5 text-[#2b2bb5]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="share-project-title" className="text-base font-semibold text-slate-900">
              Share this project
            </h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">
              Paste the link in WhatsApp and it shows a preview of the deliverables. Anyone with the link can
              view the list (read only, no sign-in).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading && <p className="text-sm text-slate-500">Creating the link…</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {share && (
          <>
            <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
              <img
                src={share.preview_url}
                alt={`Preview of ${project.name}`}
                className="block aspect-[1200/630] w-full bg-slate-50 object-cover"
                data-testid="share-project-preview"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                readOnly
                value={share.url}
                aria-label="Project link"
                data-testid="share-project-link"
                onFocus={(e) => e.target.select()}
                className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 px-2.5 text-[13px] text-slate-700 outline-none focus:border-[#2b2bb5]"
              />
              <Button type="button" variant="outline" onClick={copy} className="gap-1.5">
                <Copy className="h-4 w-4" />
                Copy
              </Button>
            </div>

            <a
              href={`https://wa.me/?text=${encodeURIComponent(whatsappText)}`}
              target="_blank"
              rel="noreferrer"
              data-testid="share-project-whatsapp"
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#25d366] text-sm font-semibold text-white hover:bg-[#1fb857]"
            >
              <MessageCircle className="h-4 w-4" />
              Send on WhatsApp
            </a>

            <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
              <span className="text-xs leading-4 text-slate-500">
                The preview is taken when the link is copied, so copy it again after the project changes.
              </span>
              <Button type="button" variant="outline" onClick={stop} disabled={busy} className="shrink-0 text-red-600">
                Stop sharing
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
