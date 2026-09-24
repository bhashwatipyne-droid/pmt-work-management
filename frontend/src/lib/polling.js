// setInterval that stays quiet while the tab is in the background and catches
// up as soon as the person comes back to it. A hidden tab used to keep
// polling the API every few seconds all day, which is load on the backend
// (and on everybody else's page loads) for nobody's benefit.
//
// Returns a cleanup function, so it can be returned straight from a
// useEffect.
export const startPolling = (callback, intervalMs) => {
  const timer = window.setInterval(() => {
    if (!document.hidden) callback();
  }, intervalMs);

  const onVisibilityChange = () => {
    if (!document.hidden) callback();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
};