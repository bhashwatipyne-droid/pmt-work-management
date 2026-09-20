import { useEffect } from "react";
import { toast } from "sonner";

import { trackEvent } from "@/analytics";
import { useUser } from "@/context/UserContext";
import { isPushSupported } from "@/lib/firebase";
import { PROMPT_DISMISSED_KEY, syncPushToken } from "@/lib/push";

const PROMPT_TOAST_ID = "enable-push-notifications";

const wasPromptDismissed = () => {
  try {
    return localStorage.getItem(PROMPT_DISMISSED_KEY) === "1";
  } catch (_) {
    return false;
  }
};

const rememberPromptDismissed = () => {
  try {
    localStorage.setItem(PROMPT_DISMISSED_KEY, "1");
  } catch (_) {}
};

// Renders nothing. Once a user is logged in it either (a) silently
// registers this browser for push if permission was already granted, or
// (b) shows a one-time toast whose "Enable" click — a real user gesture,
// which browsers require — triggers the permission prompt.
export default function PushNotifications() {
  const { isAuthenticated, currentUser } = useUser();
  const userId = currentUser?.id;

  useEffect(() => {
    if (!isAuthenticated || !userId) return;

    let cancelled = false;

    const register = async () => {
      try {
        return Boolean(await syncPushToken(userId));
      } catch (error) {
        console.warn("Push notification setup failed:", error);
        return false;
      }
    };

    const setup = async () => {
      if (!(await isPushSupported()) || cancelled) return;

      if (Notification.permission === "granted") {
        await register();
        return;
      }

      if (Notification.permission !== "default" || wasPromptDismissed()) return;

      toast("Turn on push notifications?", {
        id: PROMPT_TOAST_ID,
        description:
          "Get alerted about new projects and deadlines even when PMT isn't open.",
        duration: Infinity,
        closeButton: true,
        action: {
          label: "Enable",
          onClick: async () => {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
              trackEvent("notification_push_permission_granted");
              if (await register()) {
                trackEvent("notification_push_registered", { platform: "web" });
              }
              toast.success("Push notifications enabled");
            } else {
              trackEvent("notification_push_permission_denied");
              rememberPromptDismissed();
            }
          },
        },
        cancel: { label: "Not now", onClick: rememberPromptDismissed },
      });
    };

    setup();

    return () => {
      cancelled = true;
      toast.dismiss(PROMPT_TOAST_ID);
    };
  }, [isAuthenticated, userId]);

  return null;
}