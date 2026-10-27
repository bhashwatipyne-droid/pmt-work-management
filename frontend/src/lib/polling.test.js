import { startPolling } from "@/lib/polling";

const setHidden = (hidden) =>
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });

beforeEach(() => {
  jest.useFakeTimers();
  setHidden(false);
});
afterEach(() => {
  jest.useRealTimers();
  setHidden(false);
});

test("runs on every interval tick while the tab is visible", () => {
  const cb = jest.fn();
  const stop = startPolling(cb, 1000);
  jest.advanceTimersByTime(3000);
  expect(cb).toHaveBeenCalledTimes(3);
  stop();
});

test("skips ticks while hidden and catches up when visible again", () => {
  const cb = jest.fn();
  const stop = startPolling(cb, 1000);
  setHidden(true);
  jest.advanceTimersByTime(3000);
  expect(cb).not.toHaveBeenCalled();
  setHidden(false);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(cb).toHaveBeenCalledTimes(1);
  stop();
});

test("minGapMs holds back the tab-return catch-up until enough time has passed", () => {
  const cb = jest.fn();
  const stop = startPolling(cb, 10_000, { minGapMs: 10_000 });
  setHidden(true);
  jest.advanceTimersByTime(4_000);
  setHidden(false);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(cb).not.toHaveBeenCalled();

  setHidden(true);
  jest.advanceTimersByTime(7_000);
  setHidden(false);
  document.dispatchEvent(new Event("visibilitychange"));
  expect(cb).toHaveBeenCalledTimes(1);
  stop();
});
