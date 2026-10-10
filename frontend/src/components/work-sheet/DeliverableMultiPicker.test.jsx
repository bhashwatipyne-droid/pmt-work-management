import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { DeliverableMultiPicker } from "./DeliverableMultiPicker";

// Radix popovers take ~40s each to open under jsdom (the existing pickers too),
// so the popover wrapper is swapped for a plain open/close one. What is under
// test is the tick list, not Radix.
jest.mock("../ui/popover", () => {
  const React = require("react");
  const Ctx = React.createContext({});
  return {
    Popover: ({ open, onOpenChange, children }) =>
      React.createElement(Ctx.Provider, { value: { open, onOpenChange } }, children),
    PopoverTrigger: ({ children }) => {
      const { open, onOpenChange } = React.useContext(Ctx);
      return React.cloneElement(children, { onClick: () => onOpenChange(!open) });
    },
    PopoverContent: ({ children }) => {
      const { open } = React.useContext(Ctx);
      return open ? React.createElement("div", null, children) : null;
    },
  };
});

global.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout engine; Radix and the list scroll helper expect these.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = () => {};

const OPTIONS = [
  { id: "d1", name: "Pharma ETF teaser", current_stage: "Content", stage_status: "Ongoing" },
  { id: "d2", name: "Diwali TVC storyboard", current_stage: "Content" },
  { id: "d3", name: "Contra fund explainer", current_stage: "Design" },
];

let container;
let root;
let commits;

const Harness = ({ initial = [], initialNotAvailable = false }) => {
  const [open, setOpen] = useState(false);
  const [ids, setIds] = useState(initial);
  const [na, setNa] = useState(initialNotAvailable);
  return (
    <DeliverableMultiPicker
      open={open}
      onOpenChange={setOpen}
      options={OPTIONS}
      selectedIds={ids}
      notAvailable={na}
      data-testid="trigger"
      onCommit={(nextIds, nextNa) => {
        commits.push({ ids: nextIds, notAvailable: nextNa });
        setIds(nextIds);
        setNa(nextNa);
      }}
    />
  );
};

const render = async (props) => {
  await act(async () => {
    root.render(<Harness {...props} />);
  });
};

const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

const byTestId = (id) => document.body.querySelector(`[data-testid="${id}"]`);

beforeEach(() => {
  commits = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

test("ticking several deliverables saves once, when the list closes", async () => {
  await render();
  await click(byTestId("trigger"));

  await click(byTestId("worksheet-deliverable-option-d1"));
  await click(byTestId("worksheet-deliverable-option-d3"));
  await click(byTestId("worksheet-deliverable-option-d2"));

  // Nothing is saved while the list is still open.
  expect(commits).toEqual([]);
  expect(byTestId("worksheet-deliverable-multi-banner").textContent).toContain("3 deliverables ticked");
  expect(byTestId("worksheet-deliverable-multi-banner").textContent).toContain("Qty 3");

  await click(byTestId("worksheet-deliverable-multi-done"));

  expect(commits).toEqual([{ ids: ["d1", "d3", "d2"], notAvailable: false }]);
  // The cell shows the first one with a +N chip.
  expect(byTestId("trigger").textContent).toContain("Pharma ETF teaser");
  expect(byTestId("worksheet-deliverable-extra-count").textContent).toBe("+2");
});

test("unticking removes it, and closing with no change saves nothing", async () => {
  await render({ initial: ["d1", "d2"] });
  await click(byTestId("trigger"));
  await click(byTestId("worksheet-deliverable-option-d2"));
  await click(byTestId("worksheet-deliverable-multi-done"));
  expect(commits).toEqual([{ ids: ["d1"], notAvailable: false }]);

  await click(byTestId("trigger"));
  await click(byTestId("worksheet-deliverable-multi-done"));
  expect(commits).toHaveLength(1);
});

test("Tick all ticks every deliverable, Clear empties the list", async () => {
  await render();
  await click(byTestId("trigger"));
  await click(byTestId("worksheet-deliverable-tick-all"));
  expect(byTestId("worksheet-deliverable-multi-banner").textContent).toContain("3 deliverables ticked");
  await click(byTestId("worksheet-deliverable-multi-done"));
  expect(commits[0].ids).toEqual(["d1", "d2", "d3"]);

  await click(byTestId("trigger"));
  const clear = [...document.body.querySelectorAll("button")].find((b) => b.textContent === "Clear");
  await click(clear);
  await click(byTestId("worksheet-deliverable-multi-done"));
  expect(commits[1]).toEqual({ ids: [], notAvailable: false });
});

test("Not available replaces the ticks", async () => {
  await render({ initial: ["d1"] });
  await click(byTestId("trigger"));
  await click(byTestId("worksheet-deliverable-option-not-available"));
  await click(byTestId("worksheet-deliverable-multi-done"));
  expect(commits).toEqual([{ ids: [], notAvailable: true }]);
});
