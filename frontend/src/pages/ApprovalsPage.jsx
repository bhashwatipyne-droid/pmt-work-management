import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getApprovals, approveDeliverable, rejectDeliverable } from "@/services/api";
import { APPROVALS } from "@/constants/testIds";
import { STAGE_COLORS } from "@/constants/projectPalette";

export default function ApprovalsPage() {
  const { currentUser, currentUserId, loading: userLoading } = useUser();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});

  const fetchItems = async () => {
    setLoading(true);
    try {
      setItems(await getApprovals(currentUserId));
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to load approvals");
    } finally { setLoading(false); }
  };

  useEffect(() => { if (currentUser && currentUser.role !== "member") fetchItems(); }, [currentUser?.id]);

  const decide = async (id, action) => {
    const note = notes[id] || "";
    try {
      if (action === "approve") await approveDeliverable(currentUserId, id, note);
      else await rejectDeliverable(currentUserId, id, note);
      toast.success(action === "approve" ? "Approved" : "Sent back for changes");
      setNotes((prev) => { const n = { ...prev }; delete n[id]; return n; });
      fetchItems();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Action failed");
    }
  };

  if (userLoading || !currentUser) return null;
  if (currentUser.role === "member") {
    return <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-600">Approvals is available to managers and admins only</div>;
  }

  return (
    <div data-testid={APPROVALS.page} className="flex-1 overflow-auto px-8 py-6">
      <div className="mb-2 flex items-baseline gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Approvals</h1>
        <span className="text-lg font-medium text-slate-400">{items.length}</span>
      </div>
      <p className="mb-6 text-sm text-slate-500">Deliverables awaiting your review. Approve to advance to the next stage, or send back for changes.</p>

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-400">Loading approvals...</div>
      ) : items.length === 0 ? (
        <div data-testid={APPROVALS.emptyState} className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <p className="text-sm font-medium text-slate-600">No pending approvals</p>
          <p className="mt-1 text-xs text-slate-400">Deliverables marked "Ready for Review" will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((d) => {
            const c = STAGE_COLORS[d.current_stage] || STAGE_COLORS.Content;
            const rework = d.stage_status === "Changes Requested";
            return (
              <div key={d.id} data-testid={`${APPROVALS.cardPrefix}-${d.id}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-[11px] font-mono text-slate-400">{d.project_code}</div>
                    <div className="text-[15px] font-semibold text-slate-900">{d.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{d.project_name} · {d.client_name || "—"}</div>
                  </div>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${rework ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                    {rework ? "Rework" : "Ready"}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${c.dot}`} />
                    <span className={`font-medium ${c.text}`}>{d.current_stage} stage</span>
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">Owner: {d.owner_name}</span>
                </div>
                {d.last_review_note && (
                  <div className="mt-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                    <span className="font-semibold">Last note:</span> {d.last_review_note}
                  </div>
                )}
                <textarea
                  data-testid={`${APPROVALS.notePrefix}-${d.id}`}
                  placeholder="Add a review note (optional)"
                  value={notes[d.id] || ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  className="mt-3 w-full resize-none rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                  rows={2}
                />
                <div className="mt-3 flex gap-2">
                  <button
                    data-testid={`${APPROVALS.approvePrefix}-${d.id}`}
                    onClick={() => decide(d.id, "approve")}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    data-testid={`${APPROVALS.rejectPrefix}-${d.id}`}
                    onClick={() => decide(d.id, "reject")}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Send Back
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
