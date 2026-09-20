import { getPushToken } from "@/lib/firebase";
import { registerPushToken, unregisterPushToken } from "@/services/api";

const REGISTRATION_KEY = "pmt_push_registration";
export const PROMPT_DISMISSED_KEY = "pmt_push_prompt_dismissed";

const readRegistration = () => {
  try {
    return JSON.parse(localStorage.getItem(REGISTRATION_KEY) || "null");
  } catch (_) {
    return null;
  }
};

// Fetch this browser's FCM token and (re)attach it to the logged-in user on
// the backend. Safe to call on every load: the backend upserts by token, so
// a browser that switches accounts is re-assigned to the new user.
export const syncPushToken = async (userId) => {
  const token = await getPushToken();
  if (!token) return null;

  await registerPushToken(token);

  try {
    localStorage.setItem(REGISTRATION_KEY, JSON.stringify({ userId, token }));
  } catch (_) {}

  return token;
};

// Called on logout so the next person on a shared browser doesn't receive
// the previous user's notifications. Best-effort: never blocks logout.
export const unregisterPush = async () => {
  const registration = readRegistration();
  if (!registration?.token) return;

  try {
    await unregisterPushToken(registration.token);
  } catch (_) {}

  try {
    localStorage.removeItem(REGISTRATION_KEY);
  } catch (_) {}
};