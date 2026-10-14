import { act } from "react";
import { createRoot } from "react-dom/client";
import { MonthPicker } from "./MonthPicker";

// The popover is irrelevant here (only the prev/next arrows are tested), and
// Radix is slow under jsdom, so it is swapped for plain pass-through wrappers.
jest.mock("../ui/popover", () => ({
  Popover: ({ children }) => <div>{children}</div>,
  PopoverTrigger: ({ children }) => <>{children}</>,
  PopoverContent: () => null,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const setup = (value, maxMonth = "2026-10") => {
  const onChange = jest.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <MonthPicker
        value={value}
        onChange={onChange}
        currentMonth={maxMonth}
        maxMonth={maxMonth}
        allowAll={false}
      />
    );
  });
  const next = host.querySelector('[aria-label="Next month"]');
  const click = () => act(() => next.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  return { next, click, onChange, cleanup: () => { act(() => root.unmount()); host.remove(); } };
};

test("the next arrow works while the next month is not past maxMonth", () => {
  const { next, click, onChange, cleanup } = setup("2026-09");
  expect(next.disabled).toBe(false);
  click();
  expect(onChange).toHaveBeenCalledWith("2026-10");
  cleanup();
});

test("the next arrow stops at maxMonth", () => {
  const { next, click, onChange, cleanup } = setup("2026-10");
  expect(next.disabled).toBe(true);
  click();
  expect(onChange).not.toHaveBeenCalled();
  cleanup();
});

test("crossing a year boundary still steps forward", () => {
  const { next, click, onChange, cleanup } = setup("2026-12", "2027-03");
  expect(next.disabled).toBe(false);
  click();
  expect(onChange).toHaveBeenCalledWith("2027-01");
  cleanup();
});
