import posthog from "posthog-js";

export const trackEvent = (eventName, properties = {}) => {
  posthog.capture(eventName, properties);
};