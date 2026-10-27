import { act } from "react";
import { createRoot } from "react-dom/client";
import { WorksheetColumnMenu } from "./WorksheetColumnMenu";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mount = (props) => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(<table><thead><tr><th><WorksheetColumnMenu column="Client" {...props} /></tr></thead></table>));
  act(() => host.querySelector("button[aria-label='Column options for Client']").click());
  return { host, root };
};

test("Wrap text toggles the column and closes the menu", () => {
  const onToggleWrap = jest.fn();
  const { root } = mount({ onToggleWrap });
  const btn = document.querySelector("[data-testid='worksheet-column-wrap']");
  expect(btn.textContent).toBe("Wrap text");
  act(() => btn.click());
  expect(onToggleWrap).toHaveBeenCalledTimes(1);
  expect(document.querySelector("[data-testid='worksheet-column-wrap']")).toBeNull();
  act(() => root.unmount());
});

test("shows Unwrap text for a wrapped column and opens directly under the header", () => {
  const { root } = mount({ onToggleWrap: () => {}, isWrapped: true });
  expect(document.querySelector("[data-testid='worksheet-column-wrap']").textContent).toBe("Unwrap text");
  const menu = document.querySelector("[data-worksheet-column-menu]");
  expect(menu.style.maxHeight).toMatch(/px$/);
  act(() => root.unmount());
});
