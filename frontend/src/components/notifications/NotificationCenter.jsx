import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bell, History, Hourglass } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { trackEvent } from "@/analytics";
import { useUser } from "@/context/UserContext";
import { listenForPush, showSystemNotification } from "@/lib/firebase";
import { startPolling } from "@/lib/polling";
import {
  addWorkRowFromNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/api";

// Push delivers new notifications instantly; this poll is only a safety net,
// so it does not need to hit the server every 10 seconds from every open tab.
const POLL_MS = 30000;

const relativeTime = (iso) => {
  if (!iso) return "";

  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

// Custom chime (frontend/public/sounds/pmt-notification.mp3). Plays only
// while PMT is open; background pushes use the operating system's sound.
let notificationAudio = null;
let lastPlayedAt = 0;

const playNotificationSound = () => {
  // A burst of pushes/polls arriving together should chime once, not stack.
  if (Date.now() - lastPlayedAt < 1200) return;
  lastPlayedAt = Date.now();

  try {
    if (!notificationAudio) {
      notificationAudio = new Audio(
        `${process.env.PUBLIC_URL || ""}/sounds/pmt-notification.mp3`
      );
      notificationAudio.preload = "auto";
      notificationAudio.volume = 0.65;
    }

    notificationAudio.currentTime = 0;
    const playback = notificationAudio.play();

    if (playback && playback.catch) {
      // Browsers block audio until the user has interacted with the page.
      playback.catch(() => {});
    }
  } catch (_) {
    // A sound problem must never interrupt PMT.
  }
};

// The panel groups what the server sends into four kinds, as in the redesign:
// New, Delay, No activity and Warning. Order here is the order of the groups
// under "All".
const CATEGORIES = {
  delay: { label: "Delay", icon: History, tone: "bg-red-50 text-red-500" },
  warning: { label: "Warning", icon: AlertTriangle, tone: "bg-amber-100 text-amber-800" },
  inactive: { label: "No activity", icon: Hourglass, tone: "bg-slate-100 text-slate-700" },
  new: { label: "New", icon: Bell, tone: "bg-[#f0f0fd] text-[#2b2bb5]" },
};
const CATEGORY_ORDER = ["delay", "warning", "inactive", "new"];
const TABS = [
  ["all", "All"],
  ["new", "New"],
  ["delay", "Delay"],
  ["inactive", "No activity"],
  ["warning", "Warning"],
];

const TYPE_CATEGORY = {
  new_project: "new",
  stage_handoff: "new",
  summary: "new",
  delayed_deadline: "delay",
  approval_stuck: "delay",
  worksheet_inactivity: "inactive",
  deliverable_missing: "warning",
};

const categoryOf = (type) => TYPE_CATEGORY[type] || "warning";

// placement: "header" (default) opens the panel under the bell and aligns it
// to the right edge; "sidebar" is for the bell in the left-hand sidebar, where
// the panel has to open towards the page instead.
export default function NotificationCenter({ placement = "header" }) {
  const { currentUser, currentUserId } = useUser();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);
  const [tab, setTab] = useState("all");
  const previousIdsRef = useRef(new Set());
  const initializedRef = useRef(false);
  const soundedIdsRef = useRef(new Set());
  const pushSoundUntilRef = useRef(0);
  const panelRef = useRef(null);

  const fetchNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!currentUserId) return;

    if (!silent) setLoading(true);

    try {
      const next = await getNotifications(currentUserId);
      const unread = next.filter((item) => !item.read_at);

      if (initializedRef.current) {
        const newlyArrived = unread.filter(
          (item) => !previousIdsRef.current.has(item.id)
        );

        if (newlyArrived.length > 0) {
          // A push already chimed for these the instant it arrived.
          const alreadySounded =
            Date.now() < pushSoundUntilRef.current ||
            newlyArrived.every((item) => soundedIdsRef.current.has(item.id));

          if (!alreadySounded) {
            playNotificationSound();
          }

          newlyArrived.forEach((item) => {
            trackEvent("notification_received", {
              notification_id: item.id,
              notification_type: item.type,
              action_type: item.action_type || null,
            });
          });
        }
      }

      previousIdsRef.current = new Set(unread.map((item) => item.id));
      initializedRef.current = true;
      setNotifications(next);
    } catch (_) {
      // Notifications are non-blocking; PMT should continue working if this fails.
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    fetchNotifications();

    return startPolling(() => fetchNotifications({ silent: true }), POLL_MS);
  }, [fetchNotifications]);

  // Push delivery is instant, the poll above is not (up to 10s). When a push
  // reaches this browser: chime now and refresh the list right away.
  useEffect(() => {
    if (!currentUserId) return undefined;

    return listenForPush((push) => {
      if (push.notification_id) {
        soundedIdsRef.current.add(push.notification_id);
      } else {
        // Summary push (no single id): hold the poll's chime for a few seconds.
        pushSoundUntilRef.current = Date.now() + 8000;
      }

      playNotificationSound();
      fetchNotifications({ silent: true });

      // PMT is visible (focused or not): Firebase gave the push to this page
      // instead of the service worker, so show the system popup ourselves,
      // even when PMT has focus. (A hidden tab's popup is already shown by
      // the worker, which sends no title to the page, so this never doubles up.)
      if (push.title) {
        showSystemNotification(push).catch(() => {});
      }
    });
  }, [currentUserId, fetchNotifications]);

  useEffect(() => {
    if (!open) return;

    const handleOutsideClick = (event) => {
      if (!panelRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const unreadCount = notifications.filter((item) => !item.read_at).length;

  const handleRead = async (notification) => {
    if (notification.read_at) return;

    try {
      await markNotificationRead(currentUserId, notification.id);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, read_at: new Date().toISOString() }
            : item
        )
      );
    } catch (_) {}
  };

  const handleNotificationClick = async (notification) => {
    const wasUnread = !notification.read_at;

    await handleRead(notification);

    trackEvent("notification_clicked", {
      notification_id: notification.id,
      notification_type: notification.type,
      action_type: notification.action_type || null,
      was_unread: wasUnread,
    });

    if (notification.action_type === "open_worksheet") {
      setOpen(false);
      navigate("/");
      return;
    }

    if (notification.action_type === "open_approvals") {
      setOpen(false);
      navigate("/approvals");
      return;
    }

    // The project detail page is admin-only. Non-admins can't open it, so
    // don't bounce them into a blocked page — just mark the notification
    // read and leave them where they are.
    if (notification.project_id && currentUser?.role === "admin") {
      setOpen(false);
      navigate(`/projects/${notification.project_id}`);
    }
  };

  // "Add deliverable" on a Not-available notice: mark it read and go straight
  // into that project, where the admin can review its deliverables and add
  // the missing one. (The notice is resolved server-side once a deliverable
  // is actually added to the project.)
  const handleAddDeliverable = async (event, notification) => {
    event.stopPropagation();
    await handleRead(notification);

    trackEvent("notification_action_clicked", {
      notification_id: notification.id,
      notification_type: notification.type,
      action_type: notification.action_type,
    });

    if (notification.project_id) {
      setOpen(false);
      navigate(`/projects/${notification.project_id}`);
    }
  };

  const handleAddRow = async (event, notification) => {
    event.stopPropagation();
    setActionId(notification.id);

    try {
      const createdItem = await addWorkRowFromNotification(
        currentUserId,
        notification.id
      );

      await markNotificationRead(currentUserId, notification.id);

      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? {
                ...item,
                read_at: new Date().toISOString(),
                actioned_at: new Date().toISOString(),
              }
            : item
        )
      );

      trackEvent("notification_action_completed", {
        notification_id: notification.id,
        notification_type: notification.type,
        action_type: notification.action_type,
      });

      toast.success("Row added to your worksheet");
      setOpen(false);
      navigate(
        "/",
        createdItem?.id
          ? { state: { newWorkItem: createdItem } }
          : { state: { refreshWorkSheet: true } }
      );
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Could not add the worksheet row"
      );
    } finally {
      setActionId(null);
    }
  };

  // On a single tab only that kind is marked; "All" marks everything in one call.
  const handleMarkAllRead = async () => {
    try {
      const now = new Date().toISOString();

      if (tab === "all") {
        await markAllNotificationsRead(currentUserId);
        setNotifications((current) =>
          current.map((item) => ({ ...item, read_at: item.read_at || now }))
        );
        return;
      }

      const targets = notifications.filter(
        (item) => !item.read_at && categoryOf(item.type) === tab
      );
      await Promise.all(
        targets.map((item) => markNotificationRead(currentUserId, item.id))
      );
      const done = new Set(targets.map((item) => item.id));
      setNotifications((current) =>
        current.map((item) =>
          done.has(item.id) ? { ...item, read_at: now } : item
        )
      );
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Could not mark notifications as read"
      );
    }
  };

  const unreadIn = (key) =>
    notifications.filter(
      (item) =>
        !item.read_at && (key === "all" || categoryOf(item.type) === key)
    ).length;

  const shown = notifications.filter(
    (item) => tab === "all" || categoryOf(item.type) === tab
  );
  const groups = (tab === "all" ? CATEGORY_ORDER : [tab])
    .map((key) => {
      const rows = shown.filter((item) => categoryOf(item.type) === key);
      return {
        key,
        rows,
        unread: rows.filter((item) => !item.read_at).length,
      };
    })
    .filter((group) => group.rows.length > 0);

  if (!currentUser) return null;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        data-testid="topbar-notifications"
        onClick={() => setOpen((current) => !current)}
        className={[
          "relative flex h-9 w-9 items-center justify-center",
          "rounded-lg text-slate-500 transition-colors",
          "hover:bg-[#f0f0fd] hover:text-[#1a1a8a]",
          "focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/20",
          open ? "bg-[#f0f0fd] text-[#1a1a8a]" : "",
        ].join(" ")}
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex min-w-[15px] translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-[15px] text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          data-testid="notification-panel"
          className={[
            "absolute top-11 z-50 flex h-[min(720px,calc(100vh-72px))] w-[520px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgb(234,238,244),0_6px_25px_rgba(13,28,61,0.1)]",
            placement === "sidebar" ? "left-0" : "right-0",
          ].join(" ")}
        >
          <div className="flex items-center gap-2 px-5 pb-2 pt-4">
            <span className="text-base font-semibold text-slate-900">
              Notifications
            </span>
            {unreadCount > 0 && (
              <span className="h-5 min-w-5 rounded-full bg-[#2b2bb5] px-1.5 text-center text-[11px] font-semibold leading-5 text-white">
                {unreadCount}
              </span>
            )}
            <span className="flex-1" />
            {unreadIn(tab) > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="h-7 rounded-md px-2 text-xs font-semibold text-[#2b2bb5] hover:bg-[#f0f0fd]"
              >
                Mark all read
              </button>
            )}
          </div>

          <div
            role="tablist"
            aria-label="Notification type"
            className="flex gap-1 overflow-x-auto px-4 shadow-[inset_0_-1px_0_rgb(234,238,244)] [scrollbar-width:none]"
          >
            {TABS.map(([key, label]) => {
              const count = unreadIn(key);
              const active = tab === key;

              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(key)}
                  className={[
                    "flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-2.5 text-[13px] font-semibold",
                    active
                      ? "text-slate-900 shadow-[inset_0_-2px_0_#2b2bb5]"
                      : "text-slate-500 hover:text-slate-700",
                  ].join(" ")}
                >
                  {label}
                  {count > 0 && (
                    <span className="h-4 min-w-4 rounded-full bg-slate-100 px-1 text-center text-[10px] font-semibold leading-4 text-slate-700">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-[13px] text-slate-500">
                Loading notifications…
              </div>
            ) : groups.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-slate-500">
                {notifications.length === 0
                  ? "No notifications yet."
                  : "No notifications of this type."}
              </div>
            ) : (
              groups.map((group) => {
                const category = CATEGORIES[group.key];
                const Icon = category.icon;

                return (
                  <div key={group.key}>
                    <div className="flex items-center gap-1.5 px-5 pb-1.5 pt-4 text-[11px] font-bold uppercase leading-[14px] tracking-wider text-slate-500">
                      {category.label}
                      {group.unread > 0 && (
                        <span className="font-semibold normal-case tracking-normal text-slate-400">
                          · {group.unread} new
                        </span>
                      )}
                    </div>

                    {group.rows.map((notification) => {
                      const unread = !notification.read_at;

                      return (
                        <div
                          key={notification.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => handleNotificationClick(notification)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              handleNotificationClick(notification);
                            }
                          }}
                          className="flex cursor-pointer items-start gap-3.5 bg-white px-5 py-3.5 text-left hover:bg-slate-50"
                        >
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${category.tone}`}
                          >
                            <Icon className="h-5 w-5" />
                          </span>

                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span
                              className={`text-[15px] leading-5 text-slate-900 ${
                                unread ? "font-semibold" : "font-normal"
                              }`}
                            >
                              {notification.title}
                            </span>
                            <span className="text-[13px] leading-[18px] text-slate-500">
                              {notification.message}
                            </span>

                            {notification.action_type === "add_deliverable" &&
                              !notification.actioned_at &&
                              notification.project_id &&
                              currentUser?.role === "admin" && (
                                <span className="mt-2">
                                  <button
                                    type="button"
                                    onClick={(event) =>
                                      handleAddDeliverable(event, notification)
                                    }
                                    className="h-7 rounded-md bg-[#2b2bb5] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#23239b]"
                                  >
                                    Add deliverable
                                  </button>
                                </span>
                              )}

                            {notification.action_type === "add_work_row" &&
                              !notification.actioned_at && (
                                <span className="mt-2">
                                  <button
                                    type="button"
                                    onClick={(event) =>
                                      handleAddRow(event, notification)
                                    }
                                    disabled={actionId === notification.id}
                                    className="h-7 rounded-md bg-[#2b2bb5] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#23239b] disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    {actionId === notification.id
                                      ? "Adding…"
                                      : "Add row"}
                                  </button>
                                </span>
                              )}
                          </span>

                          <span className="flex shrink-0 flex-col items-end gap-1.5">
                            <span className="text-xs text-slate-500">
                              {relativeTime(notification.created_at)}
                            </span>
                            <span
                              className={`h-2 w-2 rounded-full ${
                                unread ? "bg-[#2b2bb5]" : "bg-transparent"
                              }`}
                            />
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}