import posthog from "posthog-js";

export const trackEvent = (eventName, properties = {}) => {
  posthog.capture(eventName, properties);
};

export const identifyUser = (user) => {
  if (!user?.id) return;

  // distinct_id is already the app's own unique user.id, not the email —
  // each PMT login already has its own separate PostHog Person. The issue
  // is purely cosmetic: PostHog's "Person display name" preference (a
  // project setting) defaults to showing a person's `email` property when
  // present, and PMT's email field has no uniqueness constraint, so
  // several distinct accounts sharing one team inbox address all render
  // under that same label. Sending `username` (which IS enforced unique
  // at signup/edit — see create_user/update_user in server.py) gives that
  // display-name preference something distinguishing to prefer instead.
  posthog.identify(String(user.id), {
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    department: user.department,
  });
};

export const resetAnalytics = () => {
  posthog.reset();
};