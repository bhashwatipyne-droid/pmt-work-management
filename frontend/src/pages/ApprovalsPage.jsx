import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { useUser } from "@/context/UserContext";
import {
  getApprovals,
  approveDeliverable,
  rejectDeliverable,
} from "@/services/api";
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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && currentUser.role !== "member") {
      fetchItems();
    }
  }, [currentUser?.id]);

  const decide = async (id, action) => {
    const note = notes[id] || "";

    try {
      if (action === "approve") {
        await approveDeliverable(currentUserId, id, note);
      } else {
        await rejectDeliverable(currentUserId, id, note);
      }

      toast.success(
        action === "approve" ? "Approved" : "Sent back for changes"
      );

      setNotes((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      fetchItems();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Action failed");
    }
  };

  if (userLoading || !currentUser) return null;

  if (currentUser.role === "member") {
    return (
      <div className="flex flex-1 items-center justify-center bg-background p-8">
        <div className="text-center">
          <div className="text-sm font-medium text-foreground">
            Approvals is available to managers and admins only
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Ask a manager or admin to review deliverables.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={APPROVALS.page}
      className="flex-1 overflow-auto bg-background px-8 py-7"
    >
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-baseline gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Approvals
          </h1>

          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
            {items.length}
          </span>
        </div>

        <p className="mt-1.5 text-sm text-muted-foreground">
          Deliverables awaiting your review. Approve to advance to the next
          stage, or send back for changes.
        </p>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="mint-card flex min-h-[240px] items-center justify-center">
          <div className="text-sm text-muted-foreground">
            Loading approvals...
          </div>
        </div>
      ) : items.length === 0 ? (
        /* Empty State */
        <div
          data-testid={APPROVALS.emptyState}
          className="mint-card flex min-h-[280px] flex-col items-center justify-center px-6 text-center"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent">
            <CheckCircle2 className="h-5 w-5 text-primary" />
          </div>

          <p className="mt-4 text-sm font-semibold text-foreground">
            No pending approvals
          </p>

          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Deliverables marked “Ready for Review” will appear here.
          </p>
        </div>
      ) : (
        /* Approval Cards */
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {items.map((d) => {
            const c =
              STAGE_COLORS[d.current_stage] || STAGE_COLORS.Content;

            const rework = d.stage_status === "Changes Requested";

            return (
              <div
                key={d.id}
                data-testid={`${APPROVALS.cardPrefix}-${d.id}`}
                className="mint-card overflow-hidden p-5 transition-shadow hover:shadow-sm"
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] font-medium text-muted-foreground">
                      {d.project_code}
                    </div>

                    <div className="mt-1 truncate text-[15px] font-semibold text-foreground">
                      {d.name}
                    </div>

                    <div className="mt-1 text-xs text-muted-foreground">
                      {d.project_name} · {d.client_name || "—"}
                    </div>
                  </div>

                  <span
                    className={[
                      "shrink-0 rounded-full px-2.5 py-1",
                      "text-[10px] font-semibold uppercase tracking-wide",
                      rework
                        ? "bg-amber-50 text-amber-700"
                        : "bg-blue-50 text-blue-700",
                    ].join(" ")}
                  >
                    {rework ? "Rework" : "Ready"}
                  </span>
                </div>

                {/* Stage / Owner */}
                <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${c.dot}`} />

                    <span className={`font-medium ${c.text}`}>
                      {d.current_stage} stage
                    </span>
                  </span>

                  <span className="text-border">·</span>

                  <span className="text-muted-foreground">
                    Owner: {d.owner_name}
                  </span>
                </div>

                {/* Previous Review Note */}
                {d.last_review_note && (
                  <div className="mt-4 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
                    <div className="text-[11px] font-semibold text-foreground">
                      Last note
                    </div>

                    <div className="mt-1 text-xs leading-5 text-muted-foreground">
                      {d.last_review_note}
                    </div>
                  </div>
                )}

                {/* Review Note */}
                <div className="mt-4">
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    Review note
                    <span className="ml-1 font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </label>

                  <textarea
                    data-testid={`${APPROVALS.notePrefix}-${d.id}`}
                    placeholder="Add a note for the creator..."
                    value={notes[d.id] || ""}
                    onChange={(e) =>
                      setNotes((prev) => ({
                        ...prev,
                        [d.id]: e.target.value,
                      }))
                    }
                    className="min-h-[72px] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs leading-5 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                    rows={3}
                  />
                </div>

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  <button
                    data-testid={`${APPROVALS.approvePrefix}-${d.id}`}
                    onClick={() => decide(d.id, "approve")}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-colors hover:bg-[hsl(240_61%_36%)] focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </button>

                  <button
                    data-testid={`${APPROVALS.rejectPrefix}-${d.id}`}
                    onClick={() => decide(d.id, "reject")}
                    className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
                    Send Back
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