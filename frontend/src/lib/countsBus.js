// Tiny pub/sub so pages that change approval/work-item status (Approvals,
// Work Sheet, Bulk Review) can tell the sidebar's badge counts — and any
// other count-polling UI, like the Bulk Review button — to refresh right
// away, instead of everyone waiting on their own next poll tick.
const EVENT_NAME = "pmt:counts-refresh";

export const refreshCounts = () => {
  window.dispatchEvent(new Event(EVENT_NAME));
};

export const onCountsRefresh = (handler) => {
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
};