import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  GripVertical,
  Clock3,
  ShieldCheck,
  Users,
  UserCheck,
} from "lucide-react";
import { useUser } from "@/context/UserContext";
import {
  getApprovalBoard,
  approveApprovalItem,
  sendBackApprovalItem,
  moveApprovalItem,
} from "@/services/api";
import { APPROVALS } from "@/constants/testIds";

const COLUMNS = [
  {
    key: "MANAGER",
    label: "Manager",
    icon: Users,
    description: "Internal manager sign-off",
  },
  {
    key: "LEADERSHIP",
    label: "Leadership",
    icon: ShieldCheck,
    description: "Leadership review",
  },
  {
    key: "CLIENT_SPOC",
    label: "Client SPOC",
    icon: UserCheck,
    description: "Client sign-off",
  },
  {
    key: "COMPLIANCE",
    label: "Compliance",
    icon: ShieldCheck,
    description: "Compliance review",
  },
];

const initialBoard = () =>
  Object.fromEntries(COLUMNS.map((column) => [column.key, []]));

export default function ApprovalsPage() {
  const { currentUser, currentUserId, loading: userLoading } = useUser();
  const [board, setBoard] = useState(initialBoard);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState({});
  const [dragging, setDragging] = useState(null);

  const fetchBoard = async () => {
    setLoading(true);
    try {
      setBoard(await getApprovalBoard(currentUserId));
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser && currentUser.role !== "member") {
      fetchBoard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const total = useMemo(
    () => COLUMNS.reduce((sum, column) => sum + (board[column.key]?.length || 0), 0),
    [board]
  );

  const decide = async (item, action) => {
    const note = notes[item.id] || "";
    try {
      if (action === "approve") {
        await approveApprovalItem(currentUserId, item.id, note);
      } else {
        await sendBackApprovalItem(currentUserId, item.id, note);
      }
      toast.success(action === "approve" ? "Approval recorded" : "Sent back for changes");
      setNotes((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await fetchBoard();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Action failed");
    }
  };

  const handleDrop = async (targetType) => {
    if (!dragging || dragging.approval_type === targetType) return;
    try {
      await moveApprovalItem(currentUserId, dragging.id, targetType);
      toast.success(`Moved to ${COLUMNS.find((c) => c.key === targetType)?.label}`);
      setDragging(null);
      await fetchBoard();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not move approval");
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
      className="flex-1 overflow-auto bg-background px-6 py-6 lg:px-8"
    >
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-baseline gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Approvals</h1>
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
              {total}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Independent approval queues. Drag a card to reassign its approval authority, or approve/send it back.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mint-card flex min-h-[280px] items-center justify-center">
          <div className="text-sm text-muted-foreground">Loading approvals...</div>
        </div>
      ) : (
        <div className="grid min-w-[1100px] grid-cols-4 gap-4">
          {COLUMNS.map((column) => {
            const Icon = column.icon;
            const items = board[column.key] || [];
            const isDropTarget = dragging && dragging.approval_type !== column.key;

            return (
              <div
                key={column.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(column.key);
                }}
                className={`flex min-h-[560px] flex-col rounded-xl border bg-[#f7f9fc] transition-colors ${
                  isDropTarget ? "border-[#b8b8e8] bg-[#f3f3ff]" : "border-border"
                }`}
              >
                <div className="border-b border-border bg-white px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-[#2b2bb5]" />
                      <span className="text-sm font-semibold text-foreground">{column.label}</span>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                      {items.length}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{column.description}</p>
                </div>

                <div className="flex-1 space-y-3 p-3">
                  {items.length === 0 ? (
                    <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-border bg-white/60 px-4 text-center">
                      <p className="text-xs text-muted-foreground">No pending approvals</p>
                    </div>
                  ) : (
                    items.map((item) => (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          setDragging(item);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", item.id);
                        }}
                        onDragEnd={() => setDragging(null)}
                        data-testid={`${APPROVALS.cardPrefix}-${item.id}`}
                        className="rounded-xl border border-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-slate-300" />
                          <div className="min-w-0 flex-1">
                            <div className="font-mono text-[10px] text-muted-foreground">{item.project_code}</div>
                            <div className="mt-1 text-sm font-semibold leading-5 text-foreground">{item.deliverable_name}</div>
                            <div className="mt-1 text-[11px] text-muted-foreground">
                              {item.project_name} · {item.client_name || "—"}
                            </div>
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                            <Clock3 className="h-3 w-3" /> Pending
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                          <span>{item.current_stage}</span>
                          <span>·</span>
                          <span>Owner: {item.owner_name}</span>
                        </div>

                        {item.comments && (
                          <div className="mt-3 rounded-lg border border-border bg-muted/50 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
                            {item.comments}
                          </div>
                        )}

                        <textarea
                          data-testid={`${APPROVALS.notePrefix}-${item.id}`}
                          placeholder="Add a review note..."
                          value={notes[item.id] || ""}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          className="mt-3 min-h-[58px] w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-[11px] leading-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                          rows={2}
                        />

                        <div className="mt-3 flex gap-2">
                          <button
                            data-testid={`${APPROVALS.approvePrefix}-${item.id}`}
                            onClick={() => decide(item, "approve")}
                            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-[hsl(240_61%_36%)]"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                          </button>
                          <button
                            data-testid={`${APPROVALS.rejectPrefix}-${item.id}`}
                            onClick={() => decide(item, "reject")}
                            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-white px-2.5 text-[11px] font-semibold text-foreground hover:bg-muted"
                          >
                            <XCircle className="h-3.5 w-3.5 text-muted-foreground" /> Send Back
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
