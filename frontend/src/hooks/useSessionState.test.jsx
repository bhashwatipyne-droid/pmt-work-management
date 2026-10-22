import { act } from "react";
import { createRoot } from "react-dom/client";
import { clearSessionState, useSessionState } from "./useSessionState";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => sessionStorage.clear());

// Mounts a component that exposes the hook's [value, set] pair.
function mountHook(key, initial) {
  const box = {};
  function Probe() {
    const [value, set] = useSessionState(key, initial);
    box.value = value;
    box.set = set;
    return null;
  }
  const host = document.createElement("div");
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  return { box, unmount: () => act(() => root.unmount()) };
}

test("remembers a value across remounts and supports lazy defaults", () => {
  const first = mountHook("k", () => ({ a: 1 }));
  expect(first.box.value).toEqual({ a: 1 });
  act(() => first.box.set((v) => ({ ...v, a: 2 })));
  first.unmount();

  const second = mountHook("k", { a: 0 });
  expect(second.box.value).toEqual({ a: 2 });
  second.unmount();
});

test("clearSessionState forgets everything", () => {
  const first = mountHook("k", "x");
  act(() => first.box.set("y"));
  first.unmount();
  clearSessionState();
  const second = mountHook("k", "x");
  expect(second.box.value).toBe("x");
  second.unmount();
});
