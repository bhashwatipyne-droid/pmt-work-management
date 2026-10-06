import { useEffect, useMemo, useState } from "react";
import { Check, ListChecks, MessageSquare, Undo2, X } from "lucide-react";
import { getBulkReview, reviewWorkItem } from "@/services/api";
import { toast } from "sonner";
import { trackEvent } from "../../analytics";
import { DialogRowsSkeleton } from "@/components/skeletons/Skeletons";
import { avatarColorClasses } from "@/lib/avatarColors";

const STAGE_DOT = {
  Content: "bg-violet-600",
  Design: "bg-sky-500",
  Animate: "bg-amber-500",
};

const GRID =
  "grid grid-cols-[24px_minmax(220px,2fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_216px] items-center gap-x-3 px-5";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const initials = (name) => {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
};

// "2026-09-25" (or "2026-09-25 00:00:00") -> how close the deadline is.
const dueInfo = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) {
    return {
      rank: Number.POSITIVE_INFINITY,
      text: "No deadline",
      full: "",
      tone: "text-slate-500 bg-slate-100",
    };
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const days = Math.round((date - startOfToday()) / 864e5);
  const label = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  const plural = (n) => `${n} ${n === 1 ? "day" : "days"}`;

  if (days < 0) {
    return { rank: days, text: `Overdue · ${-days}d`, full: `${label} · ${plural(-days)} overdue`, tone: "text-red-600 bg-red-50" };
  }
  if (days === 0) {
    return { rank: days, text: "Due today", full: `Today · ${label}`, tone: "text-amber-800 bg-amber-100" };
  }
  if (days === 1) {
    return { rank: days, text: "Due tomorrow", full: `Tomorrow · ${label}`, tone: "text-amber-800 bg-amber-100" };
  }
  return { rank: days, text: `Due ${label}`, full: `${label} · in ${plural(days)}`, tone: "text-slate-700 bg-slate-100" };
};

// When the row was handed in for review (its last update), and how long ago.
const receivedInfo = (value) => {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    return { day: "—", time: "", ago: "", waited: 0 };
  }
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  const today = startOfToday();
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today - dayStart) / 864e5);
  const day =
    diffDays === 0
      ? "Today"
      : diffDays === 1
        ? "Yesterday"
        : `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`;
  const hours = date.getHours() % 12 || 12;
  const time = `${hours}:${String(date.getMinutes()).padStart(2, "0")}${date.getHours() < 12 ? "am" : "pm"}`;
  const ago =
    minutes < 60
      ? `${Math.max(1, minutes)}m ago`
      : minutes < 1440
        ? `${Math.round(minutes / 60)}h ago`
        : `${Math.round(minutes / 1440)}d ago`;
  return { day, time, ago, waited: minutes };
};

const Box = ({ checked, mixed = false }) => (
  <span
    className={`flex h-4 w-4 items-center justify-center rounded-[5px] text-white transition-colors ${
      checked || mixed ? "bg-[#2b2bb5]" : "bg-white ring-1 ring-inset ring-slate-300"
    }`}
  >
    {checked && <Check className="h-3 w-3" />}
    {mixed && !checked && <span className="h-0.5 w-2 rounded-sm bg-white" />}
  </span>
);

export default function BulkReviewModal({ open, onClose, currentUser }) {
  const [items, setItems] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [notes, setNotes] = useState({});
  const [notesOpen, setNotesOpen] = useState({});
  const [bulkNote, setBulkNote] = useState("");
  const [sort, setSort] = useState("deadline");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState({});

  const fetchItems = async () => {
    if (!currentUser) return;

    setLoading(true);

    try {
      const data = await getBulkReview(currentUser.id);
      setItems(data);
      setSelectedIds([]);
      setNotes({});
      setNotesOpen({});
      setBulkNote("");

      trackEvent("bulk_review_opened", {
        item_count: data.length,
      });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentUser]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const rows = useMemo(() => {
    const decorated = items.map((item) => ({
      item,
      due: dueInfo(item.due_date),
      received: receivedInfo(item.updated_at),
    }));
    decorated.sort((a, b) =>
      sort === "deadline"
        ? a.due.rank - b.due.rank
        : b.received.waited - a.received.waited
    );
    return decorated;
  }, [items, sort]);

  if (!open) return null;

  const ids = rows.map((row) => row.item.id);
  const selectedCount = ids.filter((id) => selectedIds.includes(id)).length;
  const allOn = selectedCount > 0 && selectedCount === ids.length;
  const overdue = rows.filter((row) => row.due.rank < 0).length;
  const soon = rows.filter((row) => row.due.rank === 0 || row.due.rank === 1).length;
  const stats = [
    { label: "Overdue", value: overdue, tone: "bg-red-50 text-red-600" },
    { label: "Due today or tomorrow", value: soon, tone: "bg-amber-100 text-amber-800" },
    { label: "Later", value: rows.length - overdue - soon, tone: "bg-slate-100 text-slate-700" },
  ];

  const toggle = (id) =>
    setSelectedIds((prev) => {
      const on = !prev.includes(id);
      const next = on ? [...prev, id] : prev.filter((x) => x !== id);
      trackEvent("bulk_review_item_selected", {
        item_id: id,
        selected: on,
        selected_count: next.length,
      });
      return next;
    });

  const toggleAll = () => {
    const next = allOn ? [] : ids;
    trackEvent("bulk_review_select_all", {
      selected: !allOn,
      selected_count: next.length,
      item_count: ids.length,
    });
    setSelectedIds(next);
  };

  const noteFor = (id) => (notes[id] || "").trim() || bulkNote.trim();

  // Approve or send back one or many rows. Sending back needs a note (the row's
  // own, or the one note for everything selected) so the creator knows why.
  const decide = async (targetIds, action) => {
    if (!targetIds.length) return;

    if (action === "request_changes") {
      const missing = targetIds.filter((id) => !noteFor(id));
      if (missing.length) {
        setNotesOpen((prev) => ({
          ...prev,
          ...Object.fromEntries(missing.map((id) => [id, true])),
        }));
        toast.error(
          `Add a note to send back ${missing.length === 1 ? "this item" : `${missing.length} items`}`
        );
        return;
      }
    }

    setBusy((prev) => ({
      ...prev,
      ...Object.fromEntries(targetIds.map((id) => [id, action])),
    }));

    const results = await Promise.allSettled(
      targetIds.map((id) => reviewWorkItem(id, action, currentUser.id, noteFor(id)))
    );

    const done = targetIds.filter((_, i) => results[i].status === "fulfilled");
    const failed = results.find((r) => r.status === "rejected");

    if (done.length) {
      trackEvent(
        targetIds.length === 1
          ? action === "approve" ? "bulk_review_approved" : "bulk_review_sent_back"
          : action === "approve" ? "bulk_review_bulk_approved" : "bulk_review_bulk_sent_back",
        targetIds.length === 1 ? { item_id: done[0] } : { item_count: done.length }
      );
      toast.success(
        `${action === "approve" ? "Approved" : "Sent back"} · ${done.length} ${done.length === 1 ? "item" : "items"}`
      );
      setItems((prev) => prev.filter((item) => !done.includes(item.id)));
      setSelectedIds((prev) => prev.filter((id) => !done.includes(id)));
      setNotes((prev) => {
        const next = { ...prev };
        done.forEach((id) => delete next[id]);
        return next;
      });
    }

    if (failed) {
      // eslint-disable-next-line no-console
      console.error("Failed to review work item:", failed.reason);
      toast.error(failed.reason?.response?.data?.detail || "Could not complete review");
    }

    setBusy((prev) => {
      const next = { ...prev };
      targetIds.forEach((id) => delete next[id]);
      return next;
    });
  };

  const anyBusy = Object.keys(busy).length > 0;
  const selectedList = ids.filter((id) => selectedIds.includes(id));

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[62] bg-[rgba(13,27,62,0.4)]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bulk review"
        className="fixed left-1/2 top-1/2 z-[63] flex h-[min(760px,calc(100vh-32px))] w-[min(1080px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_6px_25px_rgba(13,28,61,0.15)]"
      >
        <div className="flex items-center gap-3 px-5 pb-4 pt-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#f0f0fd] text-[#2b2bb5]">
            <ListChecks className="h-5 w-5" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="text-base font-semibold text-slate-900">Bulk review</h2>
            <span className="text-[13px] leading-[18px] text-slate-500">
              {rows.length} {rows.length === 1 ? "item" : "items"} waiting for review
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 px-5 pb-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-3 rounded-[10px] px-3.5 py-3 ring-1 ring-inset ring-slate-200/70"
            >
              <span
                className={`h-8 min-w-8 rounded-lg px-2 text-center text-[15px] font-semibold leading-8 tabular-nums ${stat.tone}`}
              >
                {stat.value}
              </span>
              <span className="text-[13px] font-medium text-slate-700">{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="flex min-h-[52px] flex-wrap items-center gap-3 bg-slate-50 px-5 shadow-[inset_0_1px_0_rgb(234,238,244),inset_0_-1px_0_rgb(234,238,244)]">
          <button
            type="button"
            role="checkbox"
            aria-checked={allOn ? true : selectedCount > 0 ? "mixed" : false}
            onClick={toggleAll}
            disabled={!rows.length}
            className="-ml-1 flex h-8 items-center gap-3 rounded-md pl-1 pr-2.5 text-[13px] font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-50"
          >
            <span className="flex w-6 justify-center">
              <Box checked={allOn} mixed={selectedCount > 0 && !allOn} />
            </span>
            {selectedCount ? `${selectedCount} selected` : "Select all"}
          </button>
          <span className="h-5 w-px bg-slate-200" />
          <div role="radiogroup" aria-label="Sort" className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Sort by</span>
            <div className="flex rounded-lg bg-slate-100 p-0.5">
              {[
                ["deadline", "Deadline"],
                ["received", "Waiting longest"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={sort === key}
                  onClick={() => setSort(key)}
                  className={`h-7 rounded-md px-3 text-xs font-semibold text-slate-900 ${
                    sort === key ? "bg-white shadow-[0_1px_2px_rgba(13,28,61,0.08)]" : ""
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <div className="min-w-[900px]">
            <div
              className={`${GRID} sticky top-0 z-10 h-9 bg-white text-xs font-semibold text-slate-500 shadow-[inset_0_-1px_0_rgb(234,238,244)]`}
            >
              <span />
              <span>Deliverable</span>
              <span>Submitted by</span>
              <span>Received</span>
              <span>Deadline</span>
              <span className="text-right">Decision</span>
            </div>

            {loading ? (
              <div className="p-5">
                <DialogRowsSkeleton rows={6} />
              </div>
            ) : rows.length === 0 ? (
              <div className="flex h-[360px] flex-col items-center justify-center gap-2 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <Check className="h-5 w-5" />
                </span>
                <span className="text-[15px] font-semibold text-slate-900">All caught up</span>
                <span className="text-[13px] text-slate-500">
                  Nothing left to review in this queue.
                </span>
              </div>
            ) : (
              rows.map(({ item, due, received }) => {
                const on = selectedIds.includes(item.id);
                const rowBusy = busy[item.id];
                const title = item.deliverable_name || item.name || "Untitled deliverable";
                const hasNote = Boolean((notes[item.id] || "").trim());
                const noteOpen = Boolean(notesOpen[item.id]);

                return (
                  <div
                    key={item.id}
                    className={`shadow-[inset_0_-1px_0_rgb(243,244,246)] transition-colors ${
                      on ? "bg-[#f0f0fd]" : "bg-white"
                    }`}
                  >
                    <div className={`${GRID} min-h-[68px]`}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={on}
                        aria-label={`Select ${title}`}
                        disabled={Boolean(rowBusy)}
                        onClick={() => toggle(item.id)}
                        className="flex h-6 w-6 items-center justify-center rounded-md"
                      >
                        <Box checked={on} />
                      </button>

                      <div className="flex min-w-0 flex-col gap-1 py-3">
                        <span
                          title={title}
                          className="line-clamp-2 text-sm font-semibold leading-[18px] text-slate-900"
                        >
                          {title}
                        </span>
                        <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-slate-500">
                          <span
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${STAGE_DOT[item.stage] || "bg-slate-400"}`}
                          />
                          <span
                            className="truncate"
                            title={`${item.client_name || "—"} · ${item.project_name || "—"}`}
                          >
                            {[item.stage, item.client_name || "—", item.project_name || "—"]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </div>

                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${avatarColorClasses(item.creator_id)}`}
                        >
                          {initials(item.creator_name)}
                        </span>
                        <span
                          title={item.creator_name}
                          className="min-w-0 truncate text-[13px] font-medium text-slate-900"
                        >
                          {item.creator_name || "Unknown"}
                        </span>
                      </span>

                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span
                          className="truncate text-[13px] font-medium leading-[18px] text-slate-900"
                          title={`${received.day}, ${received.time}`}
                        >
                          {received.time ? `${received.day}, ${received.time}` : received.day}
                        </span>
                        <span className="text-xs leading-4 text-slate-500">{received.ago}</span>
                      </span>

                      <span className="flex min-w-0 flex-col items-start gap-1">
                        <span
                          className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-4 ${due.tone}`}
                        >
                          {due.text}
                        </span>
                        {due.full && (
                          <span className="max-w-full truncate text-[11px] leading-[14px] text-slate-500">
                            {due.full}
                          </span>
                        )}
                      </span>

                      <span className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          aria-expanded={noteOpen}
                          onClick={() =>
                            setNotesOpen((prev) => ({ ...prev, [item.id]: !prev[item.id] }))
                          }
                          className={`flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 text-xs font-semibold hover:bg-[#f0f0fd] hover:text-[#1a1a8a] ${
                            noteOpen || hasNote
                              ? "bg-[#f0f0fd] text-[#1a1a8a] ring-1 ring-inset ring-[#dcdcf8]"
                              : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200"
                          }`}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          {hasNote ? "Feedback added" : "Add feedback"}
                        </button>
                        <button
                          type="button"
                          aria-label="Request changes"
                          title="Request changes"
                          disabled={Boolean(rowBusy)}
                          onClick={() => decide([item.id], "request_changes")}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-800 hover:ring-1 hover:ring-inset hover:ring-amber-500 disabled:opacity-50"
                        >
                          <Undo2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Approve"
                          title="Approve"
                          disabled={Boolean(rowBusy)}
                          onClick={() => decide([item.id], "approve")}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500 text-white hover:opacity-85 disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </span>
                    </div>

                    {noteOpen && (
                      <div className={`${GRID} pb-3.5`}>
                        <span />
                        <textarea
                          aria-label={`Review note for ${title}`}
                          value={notes[item.id] || ""}
                          onChange={(event) =>
                            setNotes((prev) => ({ ...prev, [item.id]: event.target.value }))
                          }
                          rows={2}
                          disabled={Boolean(rowBusy)}
                          placeholder="Review note. Required when requesting changes."
                          className="col-[2/-1] min-h-[52px] w-full resize-y rounded-lg bg-white px-2.5 py-2 text-[13px] leading-[18px] text-slate-900 outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-[#2b2bb5]"
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex min-h-[60px] flex-wrap items-center gap-3 bg-white px-5 shadow-[inset_0_1px_0_rgb(234,238,244)]">
          {selectedCount > 0 ? (
            <>
              <span className="whitespace-nowrap text-[13px] font-semibold text-slate-900">
                {selectedCount} selected
              </span>
              <input
                aria-label="Note for selected items"
                value={bulkNote}
                onChange={(event) => setBulkNote(event.target.value)}
                placeholder="One note for all selected (optional)"
                className="h-[34px] min-w-0 flex-[1_1_220px] rounded-md bg-white px-2.5 text-[13px] text-slate-900 outline-none ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-[#2b2bb5]"
              />
            </>
          ) : (
            <span className="flex-1 text-xs text-slate-500">
              Select items to approve or send back together.
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              aria-disabled={selectedCount === 0}
              disabled={selectedCount === 0 || anyBusy}
              onClick={() => decide(selectedList, "request_changes")}
              className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md bg-white px-3.5 text-[13px] font-semibold text-slate-900 ring-1 ring-inset ring-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Undo2 className="h-3.5 w-3.5" />
              Request changes
            </button>
            <button
              type="button"
              aria-disabled={selectedCount === 0}
              disabled={selectedCount === 0 || anyBusy}
              onClick={() => decide(selectedList, "approve")}
              className="flex h-[34px] items-center gap-1.5 whitespace-nowrap rounded-md bg-emerald-500 px-4 text-[13px] font-semibold text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Check className="h-3.5 w-3.5" />
              {selectedCount ? `Approve ${selectedCount}` : "Approve"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
