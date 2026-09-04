import { useEffect, useState } from "react";
import { CheckCircle2, MessageSquare, RefreshCw, XCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { getBulkReview, approveDeliverable, rejectDeliverable } from "@/services/api";
import { toast } from "sonner";

export default function BulkReviewModal({
  open,
  onClose,
  currentUser,
}) {
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchItems = async () => {
    if (!currentUser) return;

    setLoading(true);

    try {
      const data = await getBulkReview(currentUser.id);
      setItems(data);
      setSelectedIds([]);
      setNotes({});
    } catch (e) {
      toast.error(
        e.response?.data?.detail || "Could not load deliverables for review"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchItems();
    }
  }, [open, currentUser]);

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.length === items.length ? [] : items.map((item) => item.id)
    );
  };

  const updateNote = (id, value) => {
    setNotes((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const handleBulkAction = async (action) => {
    if (!selectedIds.length) {
      toast.error("Select at least one deliverable");
      return;
    }

    setActionLoading(true);

    try {
      for (const id of selectedIds) {
        const note = notes[id] || "";

        if (action === "approve") {
          await approveDeliverable(currentUser.id, id, note);
        } else {
          await rejectDeliverable(currentUser.id, id, note);
        }
      }

      toast.success(
        `${selectedIds.length} deliverable${
          selectedIds.length === 1 ? "" : "s"
        } ${action === "approve" ? "approved" : "sent back"}`
      );

      await fetchItems();
    } catch (e) {
      toast.error(
        e.response?.data?.detail || "Could not complete bulk review"
      );
    } finally {
      setActionLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-xl bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Bulk Review</h2>
            <p className="text-sm text-muted-foreground">
              Deliverables waiting for review
            </p>
          </div>

          <Button variant="ghost" size="icon" onClick={onClose}>
            <XCircle className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={items.length > 0 && selectedIds.length === items.length}
                onChange={toggleSelectAll}
              />
              Select all
            </label>

            <span className="text-sm text-muted-foreground">
              {selectedIds.length} selected
            </span>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!selectedIds.length || actionLoading}
              onClick={() => handleBulkAction("reject")}
            >
              <XCircle className="mr-1.5 h-4 w-4" />
              Request Changes
            </Button>

            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={!selectedIds.length || actionLoading}
              onClick={() => handleBulkAction("approve")}
            >
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Approve Selected
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading deliverables...
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-600" />
              <p className="font-medium">Nothing waiting for review</p>
              <p className="mt-1 text-sm text-muted-foreground">
                All deliverables for your stage are currently cleared.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-lg border p-4 ${
                    selectedIds.includes(item.id)
                      ? "border-primary bg-primary/5"
                      : "bg-card"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="mt-1"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="font-medium">{item.name}</h3>

                          <p className="mt-1 text-sm text-muted-foreground">
                            {item.project_code
                              ? `${item.project_code} · `
                              : ""}
                            {item.project_name}
                          </p>

                          <p className="text-sm text-muted-foreground">
                            Client: {item.client_name || "—"} · Owner:{" "}
                            {item.owner_name || "Unassigned"}
                          </p>
                        </div>

                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                          Ready for Review
                        </span>
                      </div>

                      <div className="mt-3">
                        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Review note
                        </div>

                        <Textarea
                          value={notes[item.id] || ""}
                          onChange={(e) =>
                            updateNote(item.id, e.target.value)
                          }
                          placeholder="Optional note..."
                          className="min-h-[60px]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}