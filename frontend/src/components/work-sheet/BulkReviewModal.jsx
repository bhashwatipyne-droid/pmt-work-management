import { useEffect, useState } from "react";
import {
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { getBulkReview, reviewWorkItem } from "@/services/api";
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
  const [actionLoading, setActionLoading] = useState({});

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
        e.response?.data?.detail ||
          "Could not load deliverables for review"
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
      prev.length === items.length
        ? []
        : items.map((item) => item.id)
    );
  };

  const updateNote = (id, value) => {
    setNotes((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const handleSingleAction = async (itemId, action) => {
    setActionLoading((prev) => ({
      ...prev,
      [itemId]: action,
    }));

    try {
      await reviewWorkItem(
        itemId,
        action,
        currentUser.id
      );

      const message =
        action === "approve"
          ? "Item approved"
          : "Item sent back for changes";

      toast.success(message);

      setItems((prev) =>
        prev.filter((item) => item.id !== itemId)
      );

      setSelectedIds((prev) =>
        prev.filter((id) => id !== itemId)
      );

      setNotes((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } catch (error) {
      console.error("Failed to review work item:", error);

      toast.error(
        error.response?.data?.detail ||
          "Could not complete review"
      );
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  };

  const handleApprove = async () => {
    if (!selectedIds.length) {
      toast.error("Select at least one item");
      return;
    }

    setActionLoading((prev) => {
      const next = { ...prev };

      selectedIds.forEach((id) => {
        next[id] = "approve";
      });

      return next;
    });

    try {
      await Promise.all(
        selectedIds.map((id) =>
          reviewWorkItem(
            id,
            "approve",
            currentUser.id
          )
        )
      );

      toast.success(
        `${selectedIds.length} item${
          selectedIds.length === 1 ? "" : "s"
        } approved`
      );

      setItems((prev) =>
        prev.filter(
          (item) => !selectedIds.includes(item.id)
        )
      );

      setSelectedIds([]);
    } catch (error) {
      console.error(
        "Failed to approve work items:",
        error
      );

      toast.error(
        error.response?.data?.detail ||
          "Could not complete bulk review"
      );
    } finally {
      setActionLoading({});
    }
  };

  const handleRequestChanges = async () => {
    if (!selectedIds.length) {
      toast.error("Select at least one item");
      return;
    }

    setActionLoading((prev) => {
      const next = { ...prev };

      selectedIds.forEach((id) => {
        next[id] = "request_changes";
      });

      return next;
    });

    try {
      await Promise.all(
        selectedIds.map((id) =>
          reviewWorkItem(
            id,
            "request_changes",
            currentUser.id
          )
        )
      );

      toast.success(
        `${selectedIds.length} item${
          selectedIds.length === 1 ? "" : "s"
        } sent back`
      );

      setItems((prev) =>
        prev.filter(
          (item) => !selectedIds.includes(item.id)
        )
      );

      setSelectedIds([]);
    } catch (error) {
      console.error(
        "Failed to request changes:",
        error
      );

      toast.error(
        error.response?.data?.detail ||
          "Could not complete bulk review"
      );
    } finally {
      setActionLoading({});
    }
  };

  if (!open) return null;

  const allSelected =
    items.length > 0 &&
    selectedIds.length === items.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 p-4">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-xl bg-background shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">
              Bulk Review
            </h2>

            <p className="text-sm text-muted-foreground">
              {items.length} item
              {items.length === 1 ? "" : "s"} waiting for review
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
          >
            <XCircle className="h-5 w-5" />
          </Button>
        </div>

        {/* Bulk actions */}
        {items.length > 0 && (
          <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
              />

              Select all

              {selectedIds.length > 0 && (
                <span className="font-normal text-muted-foreground">
                  ({selectedIds.length} selected)
                </span>
              )}
            </label>

            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  !selectedIds.length ||
                  Object.keys(actionLoading).length > 0
                }
                onClick={handleRequestChanges}
              >
                <XCircle className="mr-1.5 h-4 w-4" />
                Request Changes
              </Button>

              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={
                  !selectedIds.length ||
                  Object.keys(actionLoading).length > 0
                }
                onClick={handleApprove}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Approve Selected
              </Button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading deliverables...
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <CheckCircle2 className="mb-3 h-10 w-10 text-emerald-600" />

              <p className="font-medium">
                Nothing waiting for review
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                All deliverables for your stage are currently cleared.
              </p>
            </div>
          ) : (
            <div className="space-y-3">

              {items.map((item) => {
                const rowLoading =
                  actionLoading[item.id];

                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border bg-card p-4 transition ${
                      selectedIds.includes(item.id)
                        ? "border-primary bg-primary/5"
                        : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">

                      {/* Checkbox */}
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() =>
                          toggleSelect(item.id)
                        }
                        disabled={!!rowLoading}
                        className="mt-1"
                      />

                      <div className="min-w-0 flex-1">

                        {/* Main row */}
                        <div className="flex items-start justify-between gap-6">

                          <div className="min-w-0">
                            <h3 className="font-medium">
                              {item.name}
                            </h3>

                            <p className="mt-1 text-sm text-muted-foreground">
                              {item.project_code
                                ? `${item.project_code} · `
                                : ""}
                              {item.project_name}
                            </p>

                            <p className="text-sm text-muted-foreground">
                              Client:{" "}
                              {item.client_name || "—"}{" "}
                              · Owner:{" "}
                              {item.owner_name ||
                                "Unassigned"}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">

                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                              Ready for Review
                            </span>

                            {/* Direct actions */}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!!rowLoading}
                              onClick={() =>
                                handleSingleAction(
                                  item.id,
                                  "request_changes"
                                )
                              }
                            >
                              {rowLoading ===
                              "request_changes" ? (
                                <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
                              ) : (
                                <XCircle className="mr-1.5 h-4 w-4" />
                              )}

                              Request Changes
                            </Button>

                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700"
                              disabled={!!rowLoading}
                              onClick={() =>
                                handleSingleAction(
                                  item.id,
                                  "approve"
                                )
                              }
                            >
                              {rowLoading ===
                              "approve" ? (
                                <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                              )}

                              Approve
                            </Button>
                          </div>
                        </div>

                        {/* Review note */}
                        <div className="mt-3">
                          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                            <MessageSquare className="h-3.5 w-3.5" />
                            Review note
                          </div>

                          <Textarea
                            value={notes[item.id] || ""}
                            onChange={(e) =>
                              updateNote(
                                item.id,
                                e.target.value
                              )
                            }
                            placeholder="Optional note..."
                            className="min-h-[60px]"
                            disabled={!!rowLoading}
                          />
                        </div>

                      </div>
                    </div>
                  </div>
                );
              })}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
