import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, CircleAlert, FolderPlus, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { useUser } from "@/context/UserContext";
import {
  addWorkRowFromNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/services/api";

const POLL_MS = 10000;
let notificationAudioContext = null;

const ensureAudioContext = () => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!notificationAudioContext) {
      notificationAudioContext = new AudioContextClass();
    }

    if (notificationAudioContext.state === "suspended") {
      notificationAudioContext.resume().catch(() => {});
    }

    return notificationAudioContext;
  } catch (_) {
    return null;
  }
};

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

const playNotificationSound = () => {
  const context = ensureAudioContext();
  if (!context) return;

  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(660, context.currentTime + 0.12);

    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
  } catch (_) {
    // Browsers can block audio until the user has interacted with the page.
  }
};

const notificationIcon = (type) =>
  type === "new_project" ? (
    <FolderPlus className="h-4 w-4" />
  ) : (
    <CircleAlert className="h-4 w-4" />
  );

export default function NotificationCenter() {
  const { currentUser, currentUserId } = useUser();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);
  const previousIdsRef = useRef(new Set());
  const initializedRef = useRef(false);
  const panelRef = useRef(null);

  const fetchNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!currentUserId) return;

    if (!silent) setLoading(true);

    try {
      const next = await getNotifications(currentUserId);
      const unread = next.filter((item) => !item.read_at);

      if (initializedRef.current) {
        const hasNewUnread = unread.some(
          (item) => !previousIdsRef.current.has(item.id)
        );

        if (hasNewUnread) {
          playNotificationSound();
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

  useEffect(() => {
    const unlockAudio = () => {
      ensureAudioContext();
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);

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
    await handleRead(notification);

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

      toast.success("Row added to your worksheet");
      setOpen(false);
      navigate("/");
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
                        notification.type === "new_project"
                          ? "bg-indigo-50 text-indigo-600"
                          : "bg-amber-50 text-amber-600",
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