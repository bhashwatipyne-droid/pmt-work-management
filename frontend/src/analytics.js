import posthog from "posthog-js";

export const trackEvent = (eventName, properties = {}) => {
  posthog.capture(eventName, properties);
};

export const identifyUser = (user) => {
  if (!user?.id) return;

  posthog.identify(String(user.id), {
    name: user.name,
    email: user.email,
    role: user.role,
  });
};

export const resetAnalytics = () => {
  posthog.reset();
};