import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { ProjectPicker } from "./ProjectPicker";

// Radix popovers are very slow under jsdom, so the popover wrapper is swapped
// for a plain open/close one (same as DeliverableMultiPicker.test.jsx). What is
// under test is the list and its search, not Radix.
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
    PopoverContent: React.forwardRef(({ children }, ref) => {
      const { open } = React.useContext(Ctx);
      return open ? React.createElement("div", { ref }, children) : null;
    }),
  };
});

global.IS_REACT_ACT_ENVIRONMENT = true;
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.scrollIntoView = () => {};

const PROJECTS = [
  { id: "p1", name: "Invesco SIF Summit", client_id: "c1", status: "Active" },
  { id: "p2", name: "Invesco Chitpad Calendar", client_id: "c1", status: "Active" },
];
const DELIVERABLES = {
  p1: [
    { id: "d1", project_id: "p1", name: "KV", type: "Key Visuals / Taglines", current_stage: "Design" },
    { id: "d2", project_id: "p1", name: "Teaser", type: "Teaser", current_stage: "Design" },
  ],
  p2: [{ id: "d3", project_id: "p2", name: "Calendar KV", type: "Poster", current_stage: "Design" }],
};
const clientNameOf = (id) => (id === "c1" ? "Invesco" : "");
// Both projects have a look-alike - the pill used to show up on each.
const LOOKALIKES = new Map([
  ["p1", [PROJECTS[1]]],
  ["p2", [PROJECTS[0]]],
]);

let container;
let root;
let picks;

const Harness = () => {
  const [open, setOpen] = useState(true);
  return (
    <ProjectPicker
      open={open}
      onOpenChange={setOpen}
      projects={PROJECTS}
      clientNameOf={clientNameOf}
      lookalikes={LOOKALIKES}
      deliverablesByProject={DELIVERABLES}
      onPick={(project, deliverable) => picks.push({ project: project.id, deliverable: deliverable?.id || null })}
    />
  );
};

const type = async (text) => {
  const input = container.querySelector("input");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const options = () => Array.from(container.querySelectorAll('[role="option"]'));

beforeEach(async () => {
  picks = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Harness />);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("ProjectPicker", () => {
  test("no 'Has a look-alike' chip on the projects", () => {
    expect(options().length).toBe(2);
    expect(container.textContent).not.toMatch(/look-alike/i);
  });

  test("typing a deliverable name finds it listed under its project", async () => {
    await type("teaser");
    const found = options();
    expect(found.length).toBe(2); // the project, then the deliverable
    expect(found[0].textContent).toMatch(/Invesco SIF Summit/);
    expect(found[1].textContent).toMatch(/Teaser/);
  });

  test("clicking the found deliverable picks the project and the deliverable together", async () => {
    await type("teaser");
    await act(async () => {
      options()[1].click();
    });
    expect(picks).toEqual([{ project: "p1", deliverable: "d2" }]);
  });

  test("a deliverable name shared by several projects lists each under its own project", async () => {
    await type("kv");
    const names = options().map((o) => o.textContent);
    expect(names.some((t) => /Invesco SIF Summit/.test(t))).toBe(true);
    expect(names.some((t) => /Invesco Chitpad Calendar/.test(t))).toBe(true);
    expect(names.filter((t) => /Key Visuals \/ Taglines/.test(t)).length).toBe(1);
    expect(names.filter((t) => /Poster/.test(t)).length).toBe(1);
  });

  test("typing only a project name does not list all its deliverables", async () => {
    await type("invesco");
    expect(options().length).toBe(2);
  });

  test("Enter on a highlighted deliverable picks project and deliverable", async () => {
    await type("calendar kv");
    const input = container.querySelector("input");
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(picks.length).toBe(1);
    expect(picks[0].project).toBe("p2");
    expect(picks[0].deliverable).toBe("d3");
  });
});
