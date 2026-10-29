import { act } from "react";
import { createRoot } from "react-dom/client";

import TaskPopover from "./TaskPopover";

jest.mock("@/context/UserContext", () => ({ useUser: () => ({ currentUser: { id: "u1", role: "admin" } }) }));
jest.mock("@/services/api", () => ({ getProjects: jest.fn(), getDeliverables: jest.fn() }));
jest.mock("@/services/planningApi", () => ({ getDeliverableTypes: jest.fn() }));

// Radix popovers are slow under jsdom; the form is what is under test.
jest.mock("@/components/ui/popover", () => {
  const React = require("react");
  const Ctx = React.createContext({});
  return {
    Popover: ({ open, onOpenChange, children }) => React.createElement(Ctx.Provider, { value: { open, onOpenChange } }, children),
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

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView = () => {};

const base = require("@/services/api");
const api = require("@/services/planningApi");

beforeEach(() => {
  base.getProjects.mockResolvedValue([{ id: "p1", name: "BBNPP Shoot Video" }]);
  base.getDeliverables.mockResolvedValue([{ id: "d1", name: "Shoot Video", deliverable_type: "Reel / Short Video" }]);
  api.getDeliverableTypes.mockResolvedValue(["Other Initiatives", "Reel / Short Video"]);
});

const info = (over = {}) => ({
  id: "t1", title: "Shoot Video", when: "Thu 29", span: "1h planned", tags: [], who: "Tejas Pawar", ini: "TP",
  project: "BBNPP Shoot Video", deliverableType: "Other Initiatives", deliverable: "Shoot Video", load: "1h today", change: "",
  projectId: "p1", deliverableId: "d1", typeValue: "Other Initiatives", canEdit: true, canReassign: false, ...over,
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mount(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<TaskPopover anchor={{ left: 0, right: 10, top: 0 }} onClose={() => {}} {...props} />));
  await flush();
  return host;
}

test("a WhatsApp task has an Edit button; a Work Sheet row does not", async () => {
  await mount({ info: info(), onEdit: jest.fn() });
  expect(document.querySelector('[aria-label="Edit project, deliverable and type"]')).not.toBeNull();
  document.body.innerHTML = "";
  await mount({ info: info({ canEdit: false }), onEdit: jest.fn() });
  expect(document.querySelector('[aria-label="Edit project, deliverable and type"]')).toBeNull();
});

test("saving sends only what changed", async () => {
  document.body.innerHTML = "";
  const onEdit = jest.fn().mockResolvedValue(true);
  await mount({ info: info(), onEdit });
  await act(async () => document.querySelector('[aria-label="Edit project, deliverable and type"]').click());
  await flush();
  // pick the type
  await act(async () => document.querySelector('[aria-label="Deliverable type"]').click());
  await flush();
  const option = [...document.querySelectorAll("[cmdk-item], [role=option]")].find((el) => el.textContent.includes("Reel / Short Video"));
  await act(async () => option.click());
  const save = [...document.querySelectorAll("button")].find((b) => b.textContent === "Save");
  await act(async () => save.click());
  expect(onEdit).toHaveBeenCalledWith({ deliverable_type: "Reel / Short Video" });
});
