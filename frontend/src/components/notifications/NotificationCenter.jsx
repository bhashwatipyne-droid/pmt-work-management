import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  CheckCheck,
  CircleAlert,
  ClipboardList,
  Clock,
  FolderPlus,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { trackEvent } from "@/analytics";
import { useUser } from "@/context/UserContext";
import { listenForPush, showSystemNotification } from "@/lib/firebase";
import {
  addWorkRowFromNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/api";

const POLL_MS = 10000;

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

const NOTIFICATION_STYLES = {
  new_project: { icon: FolderPlus, tone: "bg-indigo-50 text-indigo-600" },
  worksheet_inactivity: {
    icon: ClipboardList,
    tone: "bg-sky-50 text-sky-600",
  },
  approval_stuck: { icon: Clock, tone: "bg-rose-50 text-rose-600" },
  deliverable_missing: { icon: CircleAlert, tone: "bg-amber-50 text-amber-600" },
};

const DEFAULT_NOTIFICATION_STYLE = {
  icon: CircleAlert,
  tone: "bg-amber-50 text-amber-600",
};

const notificationStyle = (type) =>
  NOTIFICATION_STYLES[type] || DEFAULT_NOTIFICATION_STYLE;

const notificationIcon = (type) => {
  const Icon = notificationStyle(type).icon;
  return <Icon className="h-4 w-4" />;
};

export default function NotificationCenter() {
  const { currentUser, currentUserId } = useUser();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);
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

    const timer = window.setInterval(() => {
      fetchNotifications({ silent: true });
    }, POLL_MS);

    return () => window.clearInterval(timer);
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

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
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
      await addWorkRowFromNotification(currentUserId, notification.id);

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
      navigate("/", { state: { refreshWorkSheet: true } });
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Could not add the worksheet row"
      );
    } finally {
      setActionId(null);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead(currentUserId);
      const now = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) => ({ ...item, read_at: item.read_at || now }))
      );
    } catch (err) {
      toast.error(
        err?.response?.data?.detail || "Could not mark notifications as read"
      );
    }
  };

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
        <div className="absolute right-0 top-11 z-50 w-[390px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">
                Notifications
              </div>
              <div className="text-[11px] text-slate-500">
                {unreadCount ? `${unreadCount} unread` : "You're all caught up"}
              </div>
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2b2bb5] hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[480px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-slate-500">
                Loading notifications…
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-slate-500">
                No notifications yet.
              </div>
            ) : (
              notifications.map((notification) => (
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
                  className={[
                    "border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-0",
                    "cursor-pointer hover:bg-slate-50",
                    !notification.read_at ? "bg-[#fafaff]" : "bg-white",
                  ].join(" ")}
                >
                  <div className="flex gap-3">
                    <div
                      className={[
                        "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        notificationStyle(notification.type).tone,
                      ].join(" ")}
                    >
                      {notificationIcon(notification.type)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900">
                          {notification.title}
                        </p>
                        {!notification.read_at && (
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#2b2bb5]" />
                        )}
                      </div>

                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        {notification.message}
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-400">
                          {relativeTime(notification.created_at)}
                        </span>

                        {notification.action_type === "add_deliverable" &&
                          !notification.actioned_at &&
                          notification.project_id &&
                          currentUser?.role === "admin" && (
                            <button
                              type="button"
                              onClick={(event) =>
                                handleAddDeliverable(event, notification)
                              }
                              className="rounded-md bg-[#2b2bb5] px-2.5 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#23239b]"
                            >
                              Add deliverable
                            </button>
                          )}

                        {notification.action_type === "add_work_row" &&
                          !notification.actioned_at && (
                            <button
                              type="button"
                              onClick={(event) =>
                                handleAddRow(event, notification)
                              }
                              disabled={actionId === notification.id}
                              className="rounded-md bg-[#2b2bb5] px-2.5 py-1.5 text-[10px] font-semibold text-white transition-colors hover:bg-[#23239b] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {actionId === notification.id
                                ? "Adding…"
                                : "Add row"}
                            </button>
                          )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {notifications.length > 0 && (
            <div className="border-t border-slate-200 px-4 py-2.5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600"
              >
                <X className="h-3 w-3" />
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}