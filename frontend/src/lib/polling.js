// setInterval that stays quiet while the tab is in the background and catches
// up as soon as the person comes back to it. A hidden tab used to keep
// polling the API every few seconds all day, which is load on the backend
// (and on everybody else's page loads) for nobody's benefit.
//
// `minGapMs` (optional) stops the catch-up on returning to the tab from
// firing again until at least that long has passed since the callback last
// ran. Slow polls (the bell's several-hours refresh) use it so switching tabs
// does not turn them back into frequent requests.
//
// Returns a cleanup function, so it can be returned straight from a
// useEffect.
export const startPolling = (callback, intervalMs, { minGapMs = 0 } = {}) => {
  let lastRun = Date.now();
  const run = () => {
    lastRun = Date.now();
    callback();
  };

  const timer = window.setInterval(() => {
    if (!document.hidden) run();
  }, intervalMs);

  const onVisibilityChange = () => {
    if (!document.hidden && Date.now() - lastRun >= minGapMs) run();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
};